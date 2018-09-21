'use strict'
/*
 * elkm1-mqtt
 *
 * Copyright (c) 2018 Bill Church
 * Licensed under MIT License (see LICENSE for more information)
 *
 */

// TODO get discovery config publishes sorted
// need to publish alarm panel information
// work on a better timing function to not overwhelm the M1EXP

// reference
// https://www.home-assistant.io/components/alarm_control_panel.manual_mqtt/
// https://www.home-assistant.io/components/alarm_control_panel.manual/
// https://www.home-assistant.io/components/alarm_control_panel.mqtt/
// https://www.home-assistant.io/components/binary_sensor.mqtt/
// https://www.home-assistant.io/components/sensor.mqtt/

const elknode = require('elkington')
const mqtt = require('mqtt')
const debugElk = require('debug')('elk')
const debugMqtt = require('debug')('mqtt')
const mqtt_sensor_prefix = process.env.MQTT_SENSOR_PREFIX || 'homeassistant/sensor/alarm'
const mqtt_area_prefix = process.env.MQTT_AREA_PREFIX || 'homeassistant/alarm_control_panel/alarm'

debugElk.enabled = (/true/i).test(process.env.ELK_DEBUG)
debugMqtt.enabled = (/true/i).test(process.env.MQTT_DEBUG)

const ts = () => new Date()

// this starts a timer to be used throughout this code to help
// buffer/slow down requests to the M1EXP so it's not overwhelmed
// need imrpovements on this, perhaps in elkington module.
var myTimer = 100
var mClientConnected = false
var elkConnected = false
var elkAuthorized = false
var myZones = {}
var myAreas = {}
for (let area = 1; area <= 8; area++) {
  myAreas[area] = {}
  myAreas[area].keypads = []
  myAreas[area].zones = []
  myAreas[area].ignore = (process.env.ELK_IGNORE_AREAS.split(' ').includes(String(area)))
}

const mClient = mqtt.connect(process.env.MQTT_BROKER_ADDRESS, {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
  keepalive: 10000,
  connectTimeout: 120000,
  reconnectPeriod: 500
})

const elk = elknode.createConnection({
  port: process.env.ELK_PORT || 2101,
  host: process.env.ELK_HOST || 'localhost',
  useSecure: (/true/i).test(process.env.ELK_SECURE),
  username: process.env.ELK_USER || null,
  password: process.env.ELK_PASSWORD || null
})

mClient.on('offline', () => {
  console.log(`${ts()} - BROKER OFFLINE`)
})

mClient.on('error', handleClientError)

mClient.on('connect', () => {
  mClientConnected = true
  console.log(`${ts()} - mqtt connected`)
})

elk.on('connect', (data) => {
  elkConnected = true
  console.log(`${ts()} - elk connected`)
  publishIt('elk/alive', 'true')
})

elk.on('authorized', () => {
  elkAuthorized = true
  debugElk(`${ts()} - elk authorized`)
  publishIt('elk/authorized', 'true')
  elk.writecmd('ka')
  setTimeout(function () {
    elk.writecmd('zp')
  }, 100)

  // ok, timing is everything. I need to seperate these messages so they don't
  // send to the M1EXP too fast and overload it. This is probably something that
  // elkington should handle, a dispatcher bascially to control the flow and prevent
  // the interface from getting clogged up. right now it "works" enough to get data
  // back, need to figure out the best way to track the state of that zone data
  function getZoneName (zone) {
    setTimeout(function () {
      elk.writesd('zone', zone)
    }, (zone * 100))
  }
  // myAreas.#.zone
  getActiveZones((zones) => {
    for (let zone in zones) {
      if (zones.hasOwnProperty(zone)) {
        myZones[zone] = {}
        myZones[zone].type = zones[zone].type
        myZones[zone].name = ''
        getZoneName(zone)
      }
    }
  })
})

elk.on('AS', (msg) => {
  Object.keys(msg.data).map((area) => {
    if (msg.data.hasOwnProperty(area)) {
      let areaNum = area.substring(4)
      if (myAreas[areaNum].ignore == false) {
        myAreas[areaNum].status = msg.data[area].armStatus
        myAreas[areaNum].ready = msg.data[area].armStatus
        debugMqtt(`${ts()} - publish: ${mqtt_area_prefix}/area_${areaNum}/status:`, msg.data[area].armStatus)
        debugMqtt(`${ts()} - publish: ${mqtt_area_prefix}/area_${areaNum}/ready:`, (/^Ready/).test(msg.data[area].armUpState).toString())
        publishIt(`${mqtt_area_prefix}/area_${areaNum}/status`, msg.data[area].armStatus)
        publishIt(`${mqtt_area_prefix}/area_${areaNum}/ready`, (/^Ready/).test(msg.data[area].armUpState).toString())
      }
    }
  })
  debugElk(`${ts()} - elk myAreas: ${JSON.stringify(myAreas)}`)
})

elk.on('KA', (msg) => {
  Object.keys(msg.data.keypad).map((kpNum) => {
    if (msg.data.keypad[kpNum].area !== 0) {
      myAreas[msg.data.keypad[kpNum].area].keypads.push(kpNum)
    }
  })
  debugElk(`${ts()} - elk myAreas ${JSON.stringify(myAreas)}`)
})

elk.on('SD', (msg) => {
  if (myZones[msg.data.address].name == '') {
    myZones[msg.data.address].name = msg.data.text
    debugElk(`${ts()} - elk zone object: ` + JSON.stringify(myZones))
    let myConfig = `{ "name": "mqtt ${msg.data.text}", "state_topic": "${mqtt_sensor_prefix}/zone_${msg.data.address}/state", "value_template": "{{ value_json.state }}", "icon": "mdi:alarm-bell" }`
    debugElk(`${ts()} - elk zone myConfig: ` + JSON.stringify(myConfig))
    publishIt(`${mqtt_sensor_prefix}/zone_${msg.data.address}/config`, myConfig, { retain: true })
  }
})

elk.on('ZC', (msg) => {
  let zoneNumber = msg.data.zoneNumber
  // publishIt('elk/zone/' + zoneNumber + '/status', (msg.data.zoneStatus.substr(0, msg.data.zoneStatus.indexOf(':'))))
  let myState = '{ "state": "' + (msg.data.zoneStatus.substr(0, msg.data.zoneStatus.indexOf(':'))) + '" }'
  debugMqtt(`${ts()} - publish: ${mqtt_sensor_prefix}/zone_` + zoneNumber + '/state: ' + myState)
  publishIt(mqtt_sensor_prefix + '/zone_' + zoneNumber + '/state', myState, { retain: true })
})

elk.on('ZP', (msg) => {
  for (let zone in msg.data) {
    // myAreas[area].zones
    myAreas[msg.data[zone]].zones.push(zone)
  }
  debugElk(`${ts()} elk - \r\n\r\n${JSON.stringify(myAreas)}\r\n\r\n`)
})

elk.on('error', handleElkError)

elk.on('end', (msg) => {
  console.log(`${ts()} - elk end: ` + JSON.stringify(msg))
  setTimeout(() => {
    process.exit()
  }, 10000)
})

function getActiveZones (cb) {
  elk.zoneDefinitionRequest((err, msg) => {
    if (err) {
      handleElkError(err)
    } else {
      let zones = {}
      Object.keys(msg.data.zone).map((zone) => {
        if (msg.data.zone[zone] !== 'Disabled') {
          zones[zone] = { type: msg.data.zone[zone] }
        }
      })
      cb(zones)
    }
  })
}

function getZoneDetail (zone) {
  elk.textDescriptionRequest('zone', zone)
}

function publishHandler (e) {
  if (e) {
    return console.error(`${ts()} - error: ` + e)
  }
  debugMqtt(`${ts()} - mqtt publish`)
}

function publishIt (topic, data, options) {
  // if mqtt broker is down, the publish will occur when it returns
  debugMqtt('publishing: ' + topic + ': ' + data)
  mClient.publish(topic, data, options, publishHandler)
}

function handleClientError (e) {
  console.error(`${ts()} - mqtt connection error to broker, exiting`)
  console.error(e)
  setTimeout(() => {
    process.exit()
  }, 10000)
}

function handleElkError (e) {
  console.error(`${ts()} - elk connection error to Elk, exiting`)
  console.error(e)
  setTimeout(() => {
    process.exit()
  }, 10000)
}

if (debugElk.enabled) {
  elk.on('any', (msg) => {
    debugElk(`${ts()} any msg: ` + JSON.stringify(msg))
  })
}
