const fs = require('fs');
const gtfs = require('gtfs-stream');
const _ = require('lodash');
const moment = require('moment');
const request = require('request');

const STOP_IDS = ['2513', '2523'];

// TODO filter out trips that aren't active / aren't running today - basically, what's the difference between trip 1733264 and 1731848

function processData(stops, trips, stopTimes, stopTimeUpdates) {
  return STOP_IDS.map(stop_id => {
    const stop = _.find(stops, { stop_id });

    const stopTimesForStop = _.filter(stopTimes, { stop_id }).map(({ trip_id, arrival_time }) => {
      const trip = _.find(trips, { trip_id });
      return {
        tripId: trip.trip_id,
        routeNumber: trip.route_id,
        routeDescription: trip.trip_headsign,
        arrivalTime: arrival_time,
      };
    });

    const stopTimeUpdatesForStop = _.filter(stopTimeUpdates, update => _.some(update.trip_update.stop_time_update, { stop_id }));
    stopTimeUpdatesForStop.forEach(update => {
      const stopTime = _.find(stopTimesForStop, { tripId: update.trip_update.trip.trip_id });
      const stopTimeUpdatesForThisStop = _.filter(update.trip_update.stop_time_update, { stop_id });
      stopTimeUpdatesForThisStop.forEach(u => {
        if (u.arrival && u.arrival.time && u.arrival.time.low) {
          stopTime.arrivalTime = moment(u.arrival.time.low * 1000).format('HH:mm:ss');
        }
      });
    });

    const now = moment();

    const filteredStopTimes = stopTimesForStop.filter(s => {
      // TODO this sucks
      const at = moment(now.format('YYYY-MM-DD ') + s.arrivalTime);
      return at > now && at <= now.clone().add(30, 'minutes');
    });
    const orderedStopTimes = _.sortBy(filteredStopTimes, 'arrivalTime');

    return {
      stopName: stop.stop_name,
      orderedStopTimes,
    };
  });
}

function updateArrivalTimes() {
  const stops = [];
  const trips = [];
  const stopTimes = [];
  const stopTimeUpdates = [];

  // TODO change back to request
  // request.get('https://www.regionofwaterloo.ca/opendatadownloads/GRT_GTFS.zip')
  fs.createReadStream('GRT_GTFS.zip')
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
      // TODO change back to request
      // request.get('http://192.237.29.212:8080/gtfsrealtime/TripUpdates')
      fs.createReadStream('TripUpdates')
        .pipe(gtfs.rt())
        .on('data', (entity) => {
          stopTimeUpdates.push(entity);
        })
        .on('finish', () => {
          const data = processData(stops, trips, stopTimes, stopTimeUpdates);
          data.forEach(({ stopName, orderedStopTimes }) => {
            console.log(stopName);
            console.log(orderedStopTimes);
          });
        });
    });
}

updateArrivalTimes();
