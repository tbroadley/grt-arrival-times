const gtfs = require("gtfs-stream");
const _ = require("lodash");
const moment = require("moment-timezone");
const request = require("request");

const STOPS = [
  [
    { id: "2523", direction: "Eastbound" },
    { id: "2513", direction: "Westbound" }
  ],
  [
    { id: "2524", direction: "Eastbound" },
    { id: "2512", direction: "Westbound" }
  ],
  [
    { id: "1171", direction: "Northbound" },
    { id: "3623", direction: "Southbound" }
  ],
  [
    { id: "3620", direction: "Eastbound" },
    { id: "3619", direction: "Westbound" }
  ]
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
  { routes, stops, trips, calendarDates, stopTimes, stopTimeUpdates },
  timeHorizon
) {
  return STOPS.map(stopPair => {
    return stopPair.map(({ id: stop_id, direction }) => {
      const stop = _.find(stops, { stop_id });

      const stopTimesForStop = _.filter(stopTimes, { stop_id })
        .map(({ trip_id, departure_time }) => {
          const { service_id, route_id, trip_headsign } = _.find(trips, {
            trip_id
          });
          const { route_long_name } = _.find(routes, { route_id });

          const calendarDate = _.find(calendarDates, {
            service_id: service_id,
            date: getStartOfDay().format("YYYYMMDD"),
            exception_type: "1" // Service is running today
          });
          if (!calendarDate) return false;

          return {
            tripId: trip_id,
            routeNumber: route_id,
            routeDescription: trip_headsign || route_long_name,
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
            stopTime.departureTime = getTime(
              u.departure.time.low * 1000
            ).format("HH:mm:ss");
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
        direction,
        orderedStopTimes
      };
    });
  });
}

function updateDepartureTimes(timeHorizon, cb) {
  const routes = [];
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
        case "route":
          routes.push(entity.data);
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
              {
                routes,
                stops,
                trips,
                calendarDates,
                stopTimes,
                stopTimeUpdates
              },
              timeHorizon
            )
          )
        );
    });
}

function weatherObjectToString({ dt, weather, main }) {
  const weatherParts = [];
  if (main && main.temp) {
    weatherParts.push(`${_.round(main.temp)}°C`);
  }
  if (weather && weather.length > 0 && weather[0].main) {
    weatherParts.push(weather[0].main);
  }

  if (dt) {
    const date = moment.utc(dt * 1000).tz("America/Toronto");
    const datePart = date.date() === getTime().date() ? "Today" : "Tomorrow";
    const timePart = date.format("LT");
    return `${datePart} at ${timePart}: ${weatherParts.join(", ")}`;
  } else {
    return weatherParts.join(", ");
  }
}

function getCurrentWeather(cityId, cb) {
  request(
    `https://api.openweathermap.org/data/2.5/weather?id=${cityId}&units=metric&appid=${
      process.env.OPEN_WEATHER_MAP_API_KEY
    }`,
    cb
  );
}

function getForecast(cityId, cb) {
  request(
    `https://api.openweathermap.org/data/2.5/forecast?id=${cityId}&units=metric&appid=${
      process.env.OPEN_WEATHER_MAP_API_KEY
    }`,
    cb
  );
}

module.exports = {
  getTime,
  getStartOfDay,
  parseDepartureTime,
  updateDepartureTimes,
  weatherObjectToString,
  getCurrentWeather,
  getForecast
};
