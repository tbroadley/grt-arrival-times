var gtfs = require('gtfs-stream');
var _ = require('lodash');
var moment = require('moment');
var request = require('request');

var STOP_IDS = ['2513', '2523'];

var stops = [];
var trips = [];
var stopTimes = [];
var stopTimeUpdates = [];

// TODO filter out trips that aren't active / aren't running today - basically, what's the difference between trip 1733264 and 1731848

function processData() {
  STOP_IDS.forEach(stop_id => {
    var stop = _.find(stops, { stop_id });

    var stopTimesForStop = _.filter(stopTimes, { stop_id }).map(({ trip_id, arrival_time }) => {
      var trip = _.find(trips, { trip_id });
      return {
        tripId: trip.trip_id,
        routeNumber: trip.route_id,
        routeDescription: trip.trip_headsign,
        arrivalTime: arrival_time,
      };
    });

    var stopTimeUpdatesForStop = _.filter(stopTimeUpdates, update => _.some(update.trip_update.stop_time_update, { stop_id }));
    stopTimeUpdatesForStop.forEach(update => {
      var stopTime = _.find(stopTimesForStop, { tripId: update.trip_update.trip.trip_id });
      var stopTimeUpdatesForThisStop = _.filter(update.trip_update.stop_time_update, { stop_id });
      stopTimeUpdatesForThisStop.forEach(u => {
        if (u.arrival && u.arrival.time && u.arrival.time.low) {
          stopTime.arrivalTime = moment(u.arrival.time.low * 1000).format('HH:mm:ss');
        }
      });
    });

    console.log(stop.stop_name);

    var now = moment();

    const filteredStopTimes = stopTimesForStop.filter(s => {
      // TODO this sucks
      var at = moment(now.format('YYYY-MM-DD ') + s.arrivalTime);
      return at > now && at <= now.clone().add(30, 'minutes');
    });
    const orderedStopTimes = _.sortBy(filteredStopTimes, 'arrivalTime');

    console.log(orderedStopTimes);
  });
}

request.get('https://www.regionofwaterloo.ca/opendatadownloads/GRT_GTFS.zip')
  .pipe(gtfs())
  .on('data', (entity) => {
    switch (entity.type) {
      case 'stop':
        stops.push(entity.data);
        break;
      case 'trip':
        trips.push(entity.data);
        break;
      case 'stop_time':
        stopTimes.push(entity.data);
        break;
    }
  })
  .on('close', () => {
    request.get('http://192.237.29.212:8080/gtfsrealtime/TripUpdates')
      .pipe(gtfs.rt())
      .on('data', (entity) => {
        stopTimeUpdates.push(entity);
      })
      .on('finish', processData);
  });
