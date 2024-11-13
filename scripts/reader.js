const { EventHubProducerClient, EventHubConsumerClient } = require('@azure/event-hubs');
const { convertIotHubToEventHubsConnectionString } = require('./iot-hub-connection-string.js');

class EventHubReader {
  constructor(iotHubConnectionString, consumerGroup) {
    this.iotHubConnectionString = iotHubConnectionString;
    this.consumerGroup = consumerGroup;
  }

  async startReadMessage(startReadMessageCallback) {
    try {
      const eventHubConnectionString = await convertIotHubToEventHubsConnectionString(this.iotHubConnectionString);
      const consumerClient = new EventHubConsumerClient(this.consumerGroup, eventHubConnectionString);
      console.log('EventHubConsumerClient successfully created from IoT Hub connection string.');

      const partitionIds = await consumerClient.getPartitionIds();
      console.log('Partition IDs:', partitionIds);

      consumerClient.subscribe({
        processEvents: (events, context) => {
          events.forEach(event => {
            startReadMessageCallback(
              event.body,
              event.enqueuedTimeUtc,
              event.systemProperties["iothub-connection-device-id"]
            );
          });
        },
        processError: (err, context) => {
          console.error('Error:', err.message || err);
        }
      });
    } catch (error) {
      console.error('Failed to start reading messages:', error.message || error);
    }
  }

  async stopReadMessage() {
    try {
      await this.consumerClient.close();
      console.log('EventHubConsumerClient closed successfully.');
    } catch (error) {
      console.error('Failed to close EventHubConsumerClient:', error.message || error);
    }
  }
}

module.exports = EventHubReader;
