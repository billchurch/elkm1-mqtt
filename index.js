'use strict'
const elknode = require('elkington')
const mqtt = require('mqtt')
const debugElk = require('debug')('elk')
const debugMqtt = require('debug')('mqtt')

// enable debug if set in .env
debugElk.enabled = (/true/i).test(process.env.ELK_DEBUG)
debugMqtt.enabled = (/true/i).test(process.env.MQTT_DEBUG)

// fixme - want this array to be int but comes from env as string
const ignoreZones = process.env.ELK_IGNORE_ZONES.split(' ')

const ts = () => new Date()

var mClientConnected = false
var elkConnected = false
var elkAuthorized = false

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
  getActiveZones((zones) => {
    debugElk('zones: ' + JSON.stringify(zones))
    for (let zone in zones) {
      if (zones.hasOwnProperty(zone)) {
        debugElk('zone: ' + zone + ' type: ' + zones[zone].type)
        getZoneName(zone, (name) => {
          debugElk('name: ' + name)
        })
      }
    }
  })
})

// need to figure this out, i think we're calling it too fast and the
// M1EXP can't respond quick enough
function getZoneName (zone, cb) {
  elk.textDescriptionRequest('zone', zone, (err, msg) => {
    if (err) {
      handleElkError(err)
    } else {
      cb(msg.data.text)
    }
  })
}

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

  // elk.textDescriptionRequest('zone', 48, function (err, msg) {
  //   if (err) {
  //     console.error(`${ts()} elk discovery err: ` + JSON.stringify(err))
  //   } else {
  //     console.log('discovery: ' + JSON.stringify(msg))
  //   }
  // })
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
        debugMqtt(`${ts()} - publish: elk/area/` + areaNum + '/status: ' + msg.data[area].armStatus)
        publishIt('elk/area/' + areaNum + '/status', msg.data[area].armStatus)
        publishIt('elk/area/' + areaNum + '/ready', (/^Ready/).test(msg.data[area].armUpState).toString())
      }
    }
  })
})

elk.on('ZC', (msg) => {
  let zoneNumber = msg.data.zoneNumber
  debugMqtt(`${ts()} - publish: elk/zone/` + zoneNumber + '/status: ' + (msg.data.zoneStatus.substr(0, msg.data.zoneStatus.indexOf(':'))))
  publishIt('elk/zone/' + zoneNumber + '/status', (msg.data.zoneStatus.substr(0, msg.data.zoneStatus.indexOf(':'))))
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
  mClient.publish(topic, data, publishHandler)
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
