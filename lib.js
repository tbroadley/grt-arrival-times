const gtfs = require("gtfs-stream");
const _ = require("lodash");
const moment = require("moment-timezone");
const request = require("request");

const STOP_IDS = [
  "2513",
  "2523",
  "2512",
  "2524",
  "1171",
  "3623",
  "3619",
  "3620"
];

function getTime(time) {
  return moment.utc(time).tz("America/Toronto");
}

function getStartOfDay() {
  const result = getTime()
    .hour(0)
    .minute(0)
    .second(0)
    .millisecond(0);

  // After midnight, subtract 24 hours, since GRT returns 25:00:00 for 1 am
  if (getTime().hour() < 4) {
    result.subtract(24, "hours");
  }

  return result;
}

function parseDepartureTime(departureTime) {
  const [hourString, minuteString, secondString] = departureTime.split(":");
  if (!hourString || !minuteString || !secondString) return false;

  const hour = _.toNumber(hourString);
  if (!_.isFinite(hour)) return false;

  const minute = _.toNumber(minuteString);
  if (!_.isFinite(minute)) return false;

  const second = _.toNumber(secondString);
  if (!_.isFinite(second)) return false;

  return getStartOfDay()
    .add(hour, "hours")
    .add(minute, "minutes")
    .add(second, "seconds");
}

function processData(
  { stops, trips, calendarDates, stopTimes, stopTimeUpdates },
  timeHorizon
) {
  return STOP_IDS.map(stop_id => {
    const stop = _.find(stops, { stop_id });

    const stopTimesForStop = _.filter(stopTimes, { stop_id })
      .map(({ trip_id, departure_time }) => {
        const trip = _.find(trips, { trip_id });

        const calendarDate = _.find(calendarDates, {
          service_id: trip.service_id,
          date: getStartOfDay().format("YYYYMMDD"),
          exception_type: "1" // Service is running today
        });
        if (!calendarDate) return false;

        return {
          tripId: trip.trip_id,
          routeNumber: trip.route_id,
          routeDescription: trip.trip_headsign,
          departureTime: departure_time
        };
      })
      .filter(s => s);

    const stopTimeUpdatesForStop = _.filter(stopTimeUpdates, update =>
      _.some(update.trip_update.stop_time_update, { stop_id })
    );
    stopTimeUpdatesForStop.forEach(update => {
      const stopTime = _.find(stopTimesForStop, {
        tripId: update.trip_update.trip.trip_id
      });
      const stopTimeUpdatesForThisStop = _.filter(
        update.trip_update.stop_time_update,
        { stop_id }
      );
      stopTimeUpdatesForThisStop.forEach(u => {
        if (u.departure && u.departure.time && u.departure.time.low) {
          stopTime.departureTime = getTime(u.departure.time.low * 1000).format(
            "HH:mm:ss"
          );
        }
      });
    });

    const filteredStopTimes = stopTimesForStop.filter(s => {
      const at = parseDepartureTime(s.departureTime);
      return at > getTime() && at <= getTime().add(timeHorizon, "minutes");
    });
    const orderedStopTimes = _.sortBy(filteredStopTimes, "departureTime");

    return {
      stopName: stop.stop_name,
      orderedStopTimes
    };
  });
}

function updateDepartureTimes(timeHorizon, cb) {
  const stops = [];
  const trips = [];
  const stopTimes = [];
  const calendarDates = [];
  const stopTimeUpdates = [];

  let entityCount = 0;

  request
    .get("https://www.regionofwaterloo.ca/opendatadownloads/GRT_GTFS.zip")
    .pipe(gtfs())
    .on("data", entity => {
      entityCount += 1;
      switch (entity.type) {
        case "stop":
          stops.push(entity.data);
          break;
        case "trip":
          trips.push(entity.data);
          break;
        case "stop_time":
          stopTimes.push(entity.data);
          break;
        case "calendar_date":
          calendarDates.push(entity.data);
      }
    })
    .on("close", () => {
      request
        .get("http://192.237.29.212:8080/gtfsrealtime/TripUpdates")
        .pipe(gtfs.rt())
        .on("data", entity => {
          stopTimeUpdates.push(entity);
        })
        .on("finish", () =>
          cb(
            processData(
              { stops, trips, calendarDates, stopTimes, stopTimeUpdates },
              timeHorizon
            )
          )
        );
    });
}

function getCurrentWeather(cityId, cb) {
  request(
    `https://api.openweathermap.org/data/2.5/weather?id=${cityId}&units=metric&appid=${
      process.env.OPEN_WEATHER_MAP_API_KEY
    }`,
    cb
  );
}

module.exports = {
  getTime,
  parseDepartureTime,
  updateDepartureTimes,
  getCurrentWeather
};
