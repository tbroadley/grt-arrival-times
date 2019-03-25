const { Box, Color } = require("ink");
const _ = require("lodash");
const React = require("react");
const h = require("react-hyperscript");

const TIME_HORIZON = 30;
const CRITICAL_TIME_HORIZON = 5;
const STOPS_PER_ROW = 4;
const REFRESH_PERIOD = 1;

const OPEN_WEATHER_MAP_CITY_ID = 6176823;

const {
  getTime,
  parseDepartureTime,
  updateDepartureTimes,
  getCurrentWeather
} = require("./lib");

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

class Weather extends React.Component {
  constructor() {
    super();
    this.state = {};
  }

  componentDidMount() {
    const update = () => {
      getCurrentWeather(OPEN_WEATHER_MAP_CITY_ID, (err, response, body) => {
        if (err) return;
        this.setState({ data: JSON.parse(body) });
      });
    };

    update();
    this.interval = setInterval(update, 30 * 60 * 1000);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  render() {
    if (!this.state.data) return null;

    const { weather, main } = this.state.data;

    let weatherParts = [];
    if (main && main.temp) {
      weatherParts.push(`${_.round(main.temp)}°C`);
    }
    if (weather && weather.length > 0 && weather[0].main) {
      weatherParts.push(weather[0].main);
    }

    return weatherParts.join(", ");
  }
}

const RouteDescription = ({ routeNumber, routeDescription }) =>
  `${routeNumber}: ${routeDescription}`;

const TimeToDeparture = ({
  stopTime: { tripId, routeNumber, routeDescription, departureTime },
  criticalTimeHorizon
}) => {
  const timeToDeparture = _.floor(
    parseDepartureTime(departureTime).diff(getTime(), "seconds") / 60
  );
  if (timeToDeparture < 0) return null;

  return h(
    Color,
    {
      bgRed: timeToDeparture <= criticalTimeHorizon
    },
    timeToDeparture === 0
      ? "<1 min "
      : timeToDeparture === 1
      ? " 1 min "
      : timeToDeparture < 10
      ? ` ${timeToDeparture} mins`
      : `${timeToDeparture} mins`
  );
};

const BusStop = ({
  stopName,
  orderedStopTimes,
  timeHorizon,
  criticalTimeHorizon
}) =>
  h(Box, { flexDirection: "column", flexGrow: 1, margin: 1 }, [
    h(Box, { marginBottom: 1 }, h(Color, { blue: true }, stopName)),
    orderedStopTimes.length === 0
      ? h(Color, { gray: true }, `No buses in the next ${timeHorizon} minutes`)
      : h(Box, { flexDirection: "row" }, [
          h(
            Box,
            { flexDirection: "column", marginRight: 1 },
            orderedStopTimes.map(stopTime => h(RouteDescription, stopTime))
          ),
          h(
            Box,
            { flexDirection: "column" },
            orderedStopTimes.map(stopTime =>
              h(TimeToDeparture, { stopTime, criticalTimeHorizon })
            )
          )
        ])
  ]);

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
        h(Clock),
        h(Weather)
      ]
    );
  }
}

module.exports = {
  App
};
