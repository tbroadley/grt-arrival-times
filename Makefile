PROJECT=grt-arrival-times
VERSION=0.1
TARGET_ARCH=armhf

SNAP_FILE=${PROJECT}_${VERSION}_${TARGET_ARCH}.snap

REMOTE_USER=tbroadley
REMOTE_IP=192.168.0.53
REMOTE_PORT=3000
REMOTE_LOGIN=${REMOTE_USER}@${REMOTE_IP}

SNAP_INSTALL_FLAGS=--devmode --dangerous

.PHONY: snap clean

all: snap copy install clean

snap:
	snapcraft

copy:
	scp ${SNAP_FILE} ${REMOTE_LOGIN}:/home/${REMOTE_USER}

install:
	ssh ${REMOTE_LOGIN} snap install ${SNAP_FILE} ${SNAP_INSTALL_FLAGS}

ssh:
	ssh ${REMOTE_LOGIN}

clean:
	rm ${SNAP_FILE}

send:
	curl http://${REMOTE_IP}:${REMOTE_PORT}/send-message -X POST -H "Content-Type: application/json" --data "{ \"message\": \"$(subst ",\\\",$(msg))\" }"
