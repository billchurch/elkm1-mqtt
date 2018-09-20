# elkm1-mqtt

[![GitHub Release][releases-shield]][releases]
![Project Stage][project-stage-shield]
[![License][license-shield]](LICENSE.md) ![Project Maintenance][maintenance-shield]

[![Buy me a coffee][buymeacoffee-shield]][buymeacoffee]

## About

This app connects to an Elk1 M1 Gold alarm system with an M1EXP ethernet expander and publishes messages to an MQTT broker.

## Installation

TODO

## Usage
```
cp .env-sample .env
// fill out all the config details
npm install --production
npm start
```

### Environment Configuration

| key                  | description                                                                          | required |
|----------------------|--------------------------------------------------------------------------------------|----------|
| ELK_USER             | Elk User Name (if using ELK_SECURE)                                                  | no       |
| ELK_PASSWORD         | Elk Password (if using ELK_SECURE)                                                   | no       |
| ELK_HOST             | IP address of M1EXP.                                                                 | yes      |
| ELK_PORT             | Port (2101 for plaintext, 2601 for TLS)                                              | no       |
| ELK_SECURE           | TLS encryption, also requires ELK_USER / ELK_PASSWORD / ELK_PORT ('true','false')    | no       |
| ELK_DEBUG            | Extra debug information for ELK (true, false)                                        | no       |
| ELK_IGNORE_ZONES     | list of zones to ignore example (1 2 3 4 5 6 7 8)                                    | no       |
| MQTT_BROKER_ADDRESS  | MQTT broker URL (eg. `mqtt://localhost:1883`)                                        | yes      |
| MQTT_USER            | Broker user                                                                          | yes      |
| MQTT_PASSWORD        | Broker password                                                                      | yes      |
| MQTT_DEBUG           | Extra debug information for MQTT (true, false)                                       | no       |

## MQTT Topics
**elk/alive** - elkm1-mqtt has connected to the M1EXP, not quite ready for traffic yet - values: ('true')

**elk/authorized** - elkm1-mqtt has connected to the M1EXP, should be ready to rock - values: ('true')

**elk/area/#/status** - AS Arming status report data - values: ('Disarmed'|'Armed Away'|'Armed Stay'|'Armed Stay Instant','Armed to Night'|'Armed to Night Instant'|'Armed to Vacation')

**elk/area/#/ready** - AS armUpState state (ready to arm?) - values: ('true'|'false')

**elk/zone/#/status** - Zone change update - values ('Violated'|'Normal')

## TODO
- Subscribe to some topics to send commands to the Elk M1 EXP (arm alarm, disarm alarm, say command)
- Publish configuration topic (zone names, areas, etc...)
- What else
- Bypass M1EXP and do utilize direct serial

## Changelog & Releases

This repository keeps a change log using [GitHub's releases][releases]
functionality. The format of the log is based on
[Keep a Changelog][keepchangelog].

Releases are based on [Semantic Versioning][semver], and use the format
of ``MAJOR.MINOR.PATCH``. In a nutshell, the version will be incremented
based on the following:

- ``MAJOR``: Incompatible or major changes.
- ``MINOR``: Backwards-compatible new features and enhancements.
- ``PATCH``: Backwards-compatible bugfixes and package updates.

## Acknoledgements
Ths MQTT code was mostly lifted from [Jeremy Bunting's][qbunt] [ambient-mqtt] app
The module for the elkington code is currently being pulled from [my branch][bill-elkington] instead of [Kevin Ohara's][kevinohara80] [offcial elkington repository][elkington] due to some enhancements and fixes that i've not yet submitted a PR for.

## License

MIT License

Copyright (c) 2018 Bill Church

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

[buymeacoffee-shield]: https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-2.svg
[buymeacoffee]: https://www.buymeacoffee.com/billchurch
[qbunt]: https://github.com/qbunt
[ambient-mqtt]: https://github.com/qbunt/ambient-mqtt
[bill-elkington]: https://github.com/billchurch/elkington
[elkington]: https://github.com/kevinohara80/elkington
[kevinohara80]: https://github.com/kevinohara80
[maintenance-shield]: https://img.shields.io/maintenance/yes/2018.svg
[project-stage-shield]: https://img.shields.io/badge/project%20stage-experimental-yellow.svg
[releases-shield]: https://badge.fury.io/gh/billchurch%2Felkm1-mqtt.svg
[releases]: https://github.com/billchurch/elkm1-mqtt/releases
[license-shield]: https://img.shields.io/github/license/billchurch/elkm1-mqtt.svg
