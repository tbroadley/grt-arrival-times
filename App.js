const { Box, Color } = require('ink');
const _ = require('lodash');
const React = require('react');
const h = require('react-hyperscript');

const TIME_HORIZON = 30;
const CRITICAL_TIME_HORIZON = 5;
const STOPS_PER_ROW = 4;
const REFRESH_PERIOD = 1;

const { getTime, parseDepartureTime, updateDepartureTimes } = require('./lib');

class App extends React.Component {
  constructor() {
    super();
    this.state = { data: [], currentTime: 'Loading time...' };
  }

  componentDidMount() {
    const update = () => {
      updateDepartureTimes(TIME_HORIZON, (data) => {
        this.setState({ data });
        if (process.env.GRT_TTY) {
          console.error(`Took ${getTime().diff(start, 'seconds')} seconds to update`);
        }
      });
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

    const { width, height } = this.props;

    return h(Box, {
      width,
      height,
      flexDirection: 'column'
    }, [
      ..._.chunk(this.state.data, STOPS_PER_ROW).map(chunk => (
        h(Box, { flexDirection: 'row', marginBottom: 3 }, chunk.map(({ stopName, orderedStopTimes }) => (
          h(Box, { flexDirection: 'column', flexGrow: 1, margin: 1 }, [
            h(Box, { marginBottom: 1 }, h(Color, { blue: true }, stopName)),
            ...(orderedStopTimes.length === 0 ?
              [h(Color, { gray: true }, `No buses in the next ${TIME_HORIZON} minutes`)] :
              orderedStopTimes.map(({ tripId, routeNumber, routeDescription, departureTime }) => {
                const timeToDeparture = _.floor(parseDepartureTime(departureTime).diff(getTime(), 'seconds') / 60);
                if (timeToDeparture < 0) return null;
                return h(Box, { marginBottom: 1, flexDirection: 'column', key: tripId }, [
                  `${routeNumber}: ${routeDescription}`,
                  h(Color, { bgRed: timeToDeparture <= CRITICAL_TIME_HORIZON },
                    timeToDeparture === 0 ? '<1 min' : timeToDeparture === 1 ? '1 min' : `${timeToDeparture} mins`
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

module.exports = {
  App,
};
