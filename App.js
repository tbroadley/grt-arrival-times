const express = require("express");
const { Box, Color } = require("ink");
const _ = require("lodash");
const moment = require("moment");
const React = require("react");
const h = require("react-hyperscript");

const TIME_HORIZON = 30;
const CRITICAL_TIME_HORIZON = 5;
const REFRESH_PERIOD = 1;

const OPEN_WEATHER_MAP_CITY_ID = 6176823;

const {
  getTime,
  getStartOfDay,
  parseDepartureTime,
  updateDepartureTimes,
  weatherObjectToString,
  getCurrentWeather,
  getForecast
} = require("./lib");

class MessageBoard extends React.Component {
  constructor() {
    super();
    this.state = { messages: [], aliases: {} };
  }

  componentDidMount() {
    const app = express();
    app.use(express.json());
    const port = 3000;

    app.post("/send-message", (req, res) => {
      const {
        ip,
        body: { message }
      } = req;

      if (!message) {
        res.status(400).end();
        return;
      } else if (message.startsWith("/alias ")) {
        this.setState(
          ({ aliases }) => ({
            aliases: {
              ...aliases,
              [ip]: message.replace("/alias ", "")
            }
          }),
          () => res.end()
        );
      } else {
        this.setState(
          ({ messages }) => ({
            messages: messages.concat([
              {
                receivedAt: getTime(),
                ipAddress: req.ip,
                text: req.body.message
              }
            ])
          }),
          () => res.end()
        );
      }
    });

    app.listen(port);
  }

  render() {
    const { messages, aliases } = this.state;

    return h(
      Box,
      { flexDirection: "column" },
      messages
        .slice(-50)
        .map(
          ({ receivedAt, ipAddress, text }) =>
            `${receivedAt.format("llll")} ${aliases[ipAddress] ||
              ipAddress} ${text}`
        )
    );
  }
}

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
    this.interval = setInterval(update, 10 * 1000);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  render() {
    return h(Box, { marginBottom: 1 }, this.state.currentTime);
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
    if (!this.state.data) return "Loading weather data...";
    return weatherObjectToString(_.omit(this.state.data, "dt"));
  }
}

class Forecast extends React.Component {
  constructor() {
    super();
    this.state = {};
  }

  componentDidMount() {
    const update = () => {
      getForecast(OPEN_WEATHER_MAP_CITY_ID, (err, response, body) => {
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
    if (!this.state.data) return "Loading weather forecast data...";

    const { list } = this.state.data;
    if (!list) return "Loading weather forecast data...";

    const keyHours = [8, 12, 18];
    const nextKeyHours = keyHours
      .map(hour => {
        const result = getStartOfDay().add(hour, "hours");
        if (getTime().hour() >= hour) {
          result.add(1, "day");
        }
        return result;
      })
      .sort();
    const nextWeatherObjects = _.filter(
      nextKeyHours.map(time =>
        list.find(({ dt }) => moment.utc(dt * 1000) >= time)
      )
    );

    return h(
      React.Fragment,
      null,
      nextWeatherObjects.map(weatherObjectToString)
    );
  }
}

const RouteDescription = ({ routeNumber, routeDescription }) => {
  const paddingCount = _.max([0, 3 - routeNumber.length]);
  return `${_.repeat(" ", paddingCount)}${routeNumber} ${routeDescription}`;
};

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
  columnWidth,
  direction,
  orderedStopTimes,
  timeHorizon,
  criticalTimeHorizon
}) =>
  h(Box, { flexDirection: "column", marginRight: 3 }, [
    h(Color, { yellow: true }, direction),
    orderedStopTimes.length === 0
      ? h(Color, { gray: true }, `No buses in the next ${timeHorizon} minutes`)
      : h(
          Box,
          {
            flexDirection: "row",
            width: columnWidth,
            justifyContent: "space-between"
          },
          [
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
          ]
        )
  ]);

class GRT extends React.Component {
  constructor() {
    super();
    this.state = {};
    this.updating = false;
  }

  componentDidMount() {
    const update = () => {
      if (this.updating) {
        return;
      }

      const start = getTime();
      this.updating = true;

      updateDepartureTimes(TIME_HORIZON, data => {
        this.setState({ data });
        this.updating = false;
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
    const { data } = this.state;
    if (!data) {
      return h(Box, { marginBottom: 1 }, "Loading GRT data...");
    }

    function departureToColumnWidth(departure) {
      if (departure && departure.routeDescription) {
        return 3 + 1 + departure.routeDescription.length + 1 + 7;
      } else {
        return 0;
      }
    }

    const columnWidth = departureToColumnWidth(
      _.maxBy(
        _.flatMap(_.flatten(data), "orderedStopTimes"),
        departureToColumnWidth
      )
    );
    return h(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      data.map((stopPair, index) =>
        h(
          Box,
          {
            flexDirection: "column",
            marginBottom: index === data.length - 1 ? 0 : 1
          },
          [
            h(Box, null, h(Color, { blueBright: true }, stopPair[0].stopName)),
            h(
              Box,
              { flexDirection: "row" },
              stopPair.map(({ direction, orderedStopTimes }) =>
                h(BusStop, {
                  columnWidth,
                  direction,
                  orderedStopTimes,
                  timeHorizon: TIME_HORIZON,
                  criticalTimeHorizon: CRITICAL_TIME_HORIZON
                })
              )
            )
          ]
        )
      )
    );
  }
}

const App = ({ width, height }) =>
  h(
    Box,
    {
      width,
      height: height - 1,
      flexDirection: "row"
    },
    [
      h(Box, { flexDirection: "column", marginRight: 1 }, [
        h(Clock),
        h(GRT),
        h(Weather),
        h(Forecast)
      ]),
      h(MessageBoard)
    ]
  );

module.exports = {
  App
};
