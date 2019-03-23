#!/usr/bin/env node
const fs = require('fs');
const gtfs = require('gtfs-stream');
const { render, Box, Color } = require('ink');
const _ = require('lodash');
const moment = require('moment-timezone');
const React = require('react');
const h = require('react-hyperscript');
const request = require('request');

const STOP_IDS = ['2513', '2523', '2512', '2524', '1171', '3623', '3619', '3620'];

const TIME_HORIZON = 30;
const CRITICAL_TIME_HORIZON = 5;
const STOPS_PER_ROW = 4;
const REFRESH_PERIOD = 1;

function getTime(time) {
  return moment.utc(time).tz('America/Toronto');
}

function getStartOfDay() {
  const result = getTime().hour(0).minute(0).second(0).millisecond(0);

  // After midnight, subtract 24 hours, since GRT returns 25:00:00 for 1 am
  if (getTime().hour() < 4) {
    result.subtract(24, 'hours')
  }

  return result;
}

function parseArrivalTime(arrivalTime) {
  const [hourString, minuteString, secondString] = arrivalTime.split(':');
  if (!hourString || !minuteString || !secondString) return false;

  const hour = _.toNumber(hourString);
  if (!_.isFinite(hour)) return false;

  const minute = _.toNumber(minuteString);
  if (!_.isFinite(minute)) return false;

  const second = _.toNumber(secondString);
  if (!_.isFinite(second)) return false;

  return getStartOfDay()
    .add(hour, 'hours')
    .add(minute, 'minutes')
    .add(second, 'seconds');
}

class App extends React.Component {
  constructor() {
    super();
    this.state = { data: [], currentTime: 'Loading time...' };
  }

  processData(stops, trips, calendarDates, stopTimes, stopTimeUpdates) {
    return STOP_IDS.map(stop_id => {
      const stop = _.find(stops, { stop_id });

      const stopTimesForStop = _.filter(stopTimes, { stop_id }).map(({ trip_id, arrival_time }) => {
        const trip = _.find(trips, { trip_id });

        const calendarDate = _.find(calendarDates, {
          service_id: trip.service_id,
          date: getStartOfDay().format('YYYYMMDD'),
          exception_type: '1', // Service is running today
        });
        if (!calendarDate) return false;

        return {
          tripId: trip.trip_id,
          routeNumber: trip.route_id,
          routeDescription: trip.trip_headsign,
          arrivalTime: arrival_time,
        };
      }).filter(s => s);

      const stopTimeUpdatesForStop = _.filter(stopTimeUpdates, update => _.some(update.trip_update.stop_time_update, { stop_id }));
      stopTimeUpdatesForStop.forEach(update => {
        const stopTime = _.find(stopTimesForStop, { tripId: update.trip_update.trip.trip_id });
        const stopTimeUpdatesForThisStop = _.filter(update.trip_update.stop_time_update, { stop_id });
        stopTimeUpdatesForThisStop.forEach(u => {
          if (u.arrival && u.arrival.time && u.arrival.time.low) {
            stopTime.arrivalTime = getTime(u.arrival.time.low * 1000).format('HH:mm:ss');
          }
        });
      });

      const filteredStopTimes = stopTimesForStop.filter(s => {
        const at = parseArrivalTime(s.arrivalTime);
        return at > getTime() && at <= getTime().add(TIME_HORIZON, 'minutes');
      });
      const orderedStopTimes = _.sortBy(filteredStopTimes, 'arrivalTime');

      return {
        stopName: stop.stop_name,
        orderedStopTimes,
      };
    });
  }

  updateArrivalTimes() {
    const start = getTime();

    const stops = [];
    const trips = [];
    const stopTimes = [];
    const calendarDates = [];
    const stopTimeUpdates = [];

    let entityCount = 0;

    request.get('https://www.regionofwaterloo.ca/opendatadownloads/GRT_GTFS.zip')
      .pipe(gtfs())
      .on('data', (entity) => {
        entityCount += 1;
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
          case 'calendar_date':
            calendarDates.push(entity.data);
        }
      })
      .on('close', () => {
        request.get('http://192.237.29.212:8080/gtfsrealtime/TripUpdates')
          .pipe(gtfs.rt())
          .on('data', (entity) => {
            stopTimeUpdates.push(entity);
          })
          .on('finish', () => {
            const data = this.processData(stops, trips, calendarDates, stopTimes, stopTimeUpdates);
            this.setState({ data });
            console.error(`Took ${getTime().diff(start, 'seconds')} seconds to update`);
          });
      });
  }

  componentDidMount() {
    const update = () => {
      this.updateArrivalTimes();
      this.setState({ currentTime: getTime().format('llll') });
    };

    update();
    this.interval = setInterval(update, REFRESH_PERIOD * 60 * 1000);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  render() {
    if (this.state.data.length === 0) return 'Loading...';

    return h(Box, {
      width: process.stdout.columns,
      height: process.stdout.rows,
      flexDirection: 'column'
    }, [
      ..._.chunk(this.state.data, STOPS_PER_ROW).map(chunk => (
        h(Box, { flexDirection: 'row', marginBottom: 3 }, chunk.map(({ stopName, orderedStopTimes }) => (
          h(Box, { flexDirection: 'column', flexGrow: 1, margin: 1 }, [
            h(Box, { marginBottom: 1 }, h(Color, { blue: true }, stopName)),
            ...(orderedStopTimes.length === 0 ?
              [h(Color, { gray: true }, `No buses in the next ${TIME_HORIZON} minutes`)] :
              orderedStopTimes.map(({ tripId, routeNumber, routeDescription, arrivalTime }) => {
                const timeToArrival = _.floor(parseArrivalTime(arrivalTime).diff(getTime(), 'seconds') / 60);
                return h(Box, { marginBottom: 1, flexDirection: 'column', key: tripId }, [
                  `${routeNumber}: ${routeDescription}`,
                  h(Color, { bgRed: timeToArrival <= CRITICAL_TIME_HORIZON },
                    timeToArrival === 0 ? '<1 min' : timeToArrival === 1 ? '1 min' : `${timeToArrival} mins`
                  )
                ]);
              })
            ),
          ])
        )))
      )),
      `${this.state.currentTime}`
    ]);
  }
}

render(h(App));
