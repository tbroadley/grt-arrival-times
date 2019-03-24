const { Box } = require("ink");
const _ = require("lodash");
const React = require("react");
const h = require("react-hyperscript");

const TIME_HORIZON = 30;
const CRITICAL_TIME_HORIZON = 5;
const STOPS_PER_ROW = 4;
const REFRESH_PERIOD = 1;

const { BusStop } = require("./BusStop");
const { getTime, updateDepartureTimes } = require("./lib");

class Clock extends React.Component {
  constructor() {
    super();
    this.state = { currentTime: "Loading time..." };
  }

  componentDidMount() {
    const update = () => {
      this.setState({ currentTime: getTime().format("llll") });
    };

    update();
    this.interval = setInterval(update, 1000);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  render() {
    return this.state.currentTime;
  }
}

class App extends React.Component {
  constructor() {
    super();
    this.state = { data: [] };
  }

  componentDidMount() {
    const update = () => {
      const start = getTime();
      updateDepartureTimes(TIME_HORIZON, data => {
        this.setState({ data });
        if (process.env.GRT_TTY) {
          console.error(
            `Took ${getTime().diff(start, "seconds")} seconds to update`
          );
        }
      });
    };

    update();
    this.interval = setInterval(update, REFRESH_PERIOD * 60 * 1000);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  render() {
    if (this.state.data.length === 0) return "Loading...";

    const { width, height } = this.props;

    return h(
      Box,
      {
        width,
        height,
        flexDirection: "column"
      },
      [
        ..._.chunk(this.state.data, STOPS_PER_ROW).map(chunk =>
          h(
            Box,
            { flexDirection: "row", marginBottom: 3 },
            chunk.map(({ stopName, orderedStopTimes }) =>
              h(BusStop, {
                stopName,
                orderedStopTimes,
                timeHorizon: TIME_HORIZON,
                criticalTimeHorizon: CRITICAL_TIME_HORIZON
              })
            )
          )
        ),
        h(Clock)
      ]
    );
  }
}

module.exports = {
  App
};
