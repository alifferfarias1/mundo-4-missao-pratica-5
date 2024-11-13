require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const CustomEventHubReader = require('./scripts/custom-event-hub-reader.js');

const iotConnectionString = process.env.IotConnectionString;
if (!iotConnectionString) {
  console.error(`Environment variable IotConnectionString is missing.`);
  return;
}
console.log(`Using IoT connection string [${iotConnectionString}]`);

const eventHubGroup = process.env.EventHubGroup;
console.log(eventHubGroup);
if (!eventHubGroup) {
  console.error(`Environment variable EventHubGroup is missing.`);
  return;
}
console.log(`Using event hub group [${eventHubGroup}]`);

// Redirect public folder requests to root
const app = express();
app.use(express.static(path.join(__dirname, 'assets')));
app.use((req, res /* , next */) => {
  res.redirect('/');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        console.log(`Broadcasting to client: ${data}`);
        client.send(data);
      } catch (error) {
        console.error(error);
      }
    }
  });
};

server.listen(process.env.PORT || '4000', () => {
  console.log('Server running on port %d.', server.address().port);
});

const eventHubClient = new CustomEventHubReader(iotConnectionString, eventHubGroup);

(async () => {
  await eventHubClient.startReadingMessages((msg, timestamp, deviceId) => {
    try {
      const data = {
        IotMessage: msg,
        Timestamp: timestamp || Date.now().toISOString(),
        DeviceID: deviceId,
      };

      wss.broadcast(JSON.stringify(data));
    } catch (error) {
      console.error('Error broadcasting message: [%s] from device [%s].', error, msg);
    }
  });
})().catch();
