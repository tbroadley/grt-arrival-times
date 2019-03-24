const { Box, Color } = require("ink");
const _ = require("lodash");
const React = require("react");
const h = require("react-hyperscript");

const { getTime, parseDepartureTime } = require("./lib");

class StopTime extends React.Component {
  render() {
    const {
      stopTime: { tripId, routeNumber, routeDescription, departureTime },
      criticalTimeHorizon
    } = this.props;

    const timeToDeparture = _.floor(
      parseDepartureTime(departureTime).diff(getTime(), "seconds") / 60
    );
    if (timeToDeparture < 0) return null;

    return h(
      Box,
      {
        marginBottom: 1,
        flexDirection: "column",
        key: tripId
      },
      [
        `${routeNumber}: ${routeDescription}`,
        h(
          Color,
          {
            bgRed: timeToDeparture <= criticalTimeHorizon
          },
          timeToDeparture === 0
            ? "<1 min"
            : timeToDeparture === 1
            ? "1 min"
            : `${timeToDeparture} mins`
        )
      ]
    );
  }
}

class BusStop extends React.Component {
  render() {
    const {
      stopName,
      orderedStopTimes,
      timeHorizon,
      criticalTimeHorizon
    } = this.props;
    return h(Box, { flexDirection: "column", flexGrow: 1, margin: 1 }, [
      h(Box, { marginBottom: 1 }, h(Color, { blue: true }, stopName)),
      ...(orderedStopTimes.length === 0
        ? [
            h(
              Color,
              { gray: true },
              `No buses in the next ${timeHorizon} minutes`
            )
          ]
        : orderedStopTimes.map(stopTime =>
            h(StopTime, { stopTime, criticalTimeHorizon })
          ))
    ]);
  }
}

module.exports = {
  BusStop
};
