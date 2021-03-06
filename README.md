# grt-arrival-times

A Node.js application that uses React, [ink](https://github.com/vadimdemedes/ink), and [realtime Grand River Transit (GRT) schedule data](https://www.grt.ca/en/about-grt/open-data.aspx) to display an automatically-updating list of buses that will arrive soon at one of a list of GRT stops. It is packaged as a [snap](https://snapcraft.io) and intended to run on a Raspberry Pi running Ubuntu Core.

```shell
git clone https://github.com/tbroadley/grt-arrival-times
cd grt-arrival-times
npm install
node index.js
```

## Building

```shell
# Add SSH key to ssh-agent
sudo snap start multipass
make
```

## Make targets

- `make snap` builds a snap file containing Node.js, the application, and the libraries it depends on.
- `make copy` copies the snap file to the Raspberry Pi.
- `make install` installs the snap file that was copied to the Raspberry Pi.
- `make clean` removes the snap file from the development machine.
- `make` runs the above four targets in sequence.
- `make ssh` opens an SSH connection to the Raspberry Pi.
- `make send msg="Your message"` sends a message to be displayed on the message board.
