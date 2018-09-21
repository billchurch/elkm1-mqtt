'use strict'
const elknode = require('elkington')
const mqtt = require('mqtt')
const debugElk = require('debug')('elk')
const debugMqtt = require('debug')('mqtt')
const mqtt_sensor_prefix = process.env.MQTT_SENSOR_PREFIX || 'homeassistant/sensor/alarm'
const mqtt_area_prefix = process.env.MQTT_SENSOR_PREFIX || 'homeassistant/sensor/alarm'

// enable debug if set in .env
debugElk.enabled = (/true/i).test(process.env.ELK_DEBUG)
debugMqtt.enabled = (/true/i).test(process.env.MQTT_DEBUG)

// fixme - want this array to be int but comes from env as string
const ignoreZones = process.env.ELK_IGNORE_ZONES.split(' ')

const ts = () => new Date()

var mClientConnected = false
var elkConnected = false
var elkAuthorized = false
var myZones = {}

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

  getActiveZones((zones) => {
    // debugElk('zones: ' + JSON.stringify(zones))
    for (let zone in zones) {
      if (zones.hasOwnProperty(zone)) {
        myZones[zone] = {}
        myZones[zone].type = zones[zone].type
        myZones[zone].name = ''
        // debugElk('zone: ' + zone + ' type: ' + zones[zone].type)
        // console.log('hello ', zone)
        getZoneName(zone)
        // getZoneName(zone, (name) => {
        //   debugElk('name: ' + name)
        // })
      }
    }
  })
})

elk.on('SD', (message) => {
  // debugElk(`${ts()} - elk zone: ${message.data.address}: ${message.data.text} `)
  if (myZones[message.data.address].name == '') {
    myZones[message.data.address].name = message.data.text
    debugElk(`${ts()} - elk zone object: ` + JSON.stringify(myZones))
    let myConfig = `{ "name": "mqtt ${message.data.text}", "state_topic": "${mqtt_sensor_prefix}/zone_${message.data.address}/state", "value_template": "{{ value_json.state }}", "icon": "mdi:alarm-bell" }`
    debugElk(`${ts()} - elk zone myConfig: ` + JSON.stringify(myConfig))
    publishIt(`${mqtt_sensor_prefix}/zone_${message.data.address}/config`, myConfig, { retain: true })
  }
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

if (debugElk.enabled) {
  elk.on('any', (msg) => {
    debugElk(`${ts()} any msg: ` + JSON.stringify(msg))
  })
}

elk.on('AS', (msg) => {
  Object.keys(msg.data).map((area) => {
    if (msg.data.hasOwnProperty(area)) {
      // fixme - want this to be an int but comes out as a string, which is fine
      // however array input for ignoreZones is also int as strings need to fix there
      // too
      let areaNum = area.substring(4)
      if (!ignoreZones.includes(areaNum)) {
        debugMqtt(`${ts()} - publish: ${mqtt_area_prefix}/area_${areaNum}/status:`, msg.data[area].armStatus)
        debugMqtt(`${ts()} - publish: ${mqtt_area_prefix}/area_${areaNum}/ready:`, (/^Ready/).test(msg.data[area].armUpState).toString())
        publishIt(`${mqtt_area_prefix}/area_${areaNum}/status`, msg.data[area].armStatus)
        publishIt(`${mqtt_area_prefix}/area_${areaNum}/ready`, (/^Ready/).test(msg.data[area].armUpState).toString())
      }
    }
  })
})

elk.on('ZC', (msg) => {
  let zoneNumber = msg.data.zoneNumber
  // publishIt('elk/zone/' + zoneNumber + '/status', (msg.data.zoneStatus.substr(0, msg.data.zoneStatus.indexOf(':'))))
  let myState = '{ "state": "' + (msg.data.zoneStatus.substr(0, msg.data.zoneStatus.indexOf(':'))) + '" }'
  debugMqtt(`${ts()} - publish: ${mqtt_sensor_prefix}/zone_` + zoneNumber + '/state: ' + myState)
  publishIt(mqtt_sensor_prefix + '/zone_' + zoneNumber + '/state', myState, { retain: true })
})

elk.on('error', handleElkError)

elk.on('end', (msg) => {
  console.log(`${ts()} - elk end: ` + JSON.stringify(msg))
  setTimeout(() => {
    process.exit()
  }, 10000)
})

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

// AR: 'Alarm Reporting to Ethernet',
// AS: 'Arming status report data',
// AT: 'Ethernet Test to IP',
// AZ: 'Alarm by zone reply',
// CC: 'Control output change update',
// CR: 'Custom value report data',
// CS: 'Control output status report data',
// CU: 'Change user code reply',
// CV: 'Counter Value Data',
// DS: 'Lighting Poll Response',
// DK: 'Display KP LCD Data',
// EM: 'Email Trigger to M1XEP',
// IC: 'Send invalid user code digits',
// IE: 'Installer program exited',
// IP: 'M1XSP Insteon Program',
// IR: 'M1XSP Insteon Read',
// KA: 'Keypad areas report data',
// KC: 'Keypad key change update',
// KF: 'Function key pressed data',
// LD: 'Log data with index',
// LW: 'Reply temperature data',
// PC: 'PLC change update',
// PS: 'PLC status report data',
// RE: 'Reset Ethernet Module',
// RP: 'ELKRP connected',
// RR: 'Real Time Clock Data',
// SD: 'Text string description report data',
// SS: 'System Trouble Status data',
// ST: 'Temperature report data',
// TC: 'Task change update',
// TR: 'Thermostat data report',
// UA: 'User code areas report data',
// VN: 'Reply Version Number of M1',
// XB: 'reserved by ELKRP',
// XK: 'Request Ethernet test',
// ZB: 'Zone bypass report data',
// ZC: 'Zone change update',
// ZD: 'Zone definition report data',
// ZP: 'Zone partition report data',
// ZS: 'Zone status report data',
// ZV: 'Zone analog voltage data'
