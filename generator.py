// Copyright (c) Fictitious Software Ltd.
// Licensed under the MIT License.

/*
  Sample code for generating an Event Hubs-compatible connection string
  from an IoT Hub connection string.
*/

const crypto = require("crypto");
const Buffer = require("buffer").Buffer;
const { Connection, ReceiverEvents, isAmqpError, parseConnectionString } = require("rhea-promise");

// Utility function to create a Shared Access Signature (SAS) token.
function createSasToken(resourceUri, signingKey, policyName, tokenValidityMinutes) {
    resourceUri = encodeURIComponent(resourceUri);

    const expiry = Math.floor(Date.now() / 1000) + tokenValidityMinutes * 60;
    const stringToSign = `${resourceUri}\n${expiry}`;

    const hmac = crypto.createHmac("sha256", Buffer.from(signingKey, "base64"));
    hmac.update(stringToSign);
    const signature = encodeURIComponent(hmac.digest("base64"));

    return `SharedAccessSignature sr=${resourceUri}&sig=${signature}&se=${expiry}&skn=${policyName}`;
}

/**
 * Transforms an IoT Hub connection string into an Event Hubs-compatible string.
 * @param {string} iotConnectionString IoT Hub connection string formatted as:
 * "HostName=my-iothub.example-devices.net;SharedAccessKeyName=MyPolicy;SharedAccessKey=Key123"
 * @returns {Promise<string>} Event Hubs-compatible connection string formatted as:
 * "Endpoint=sb://example-host/;EntityPath=my-iothub;SharedAccessKeyName=MyPolicy;SharedAccessKey=Key123"
 */
async function convertToEventHubsCompatibleString(iotConnectionString) {
    const { HostName, SharedAccessKeyName, SharedAccessKey } = parseConnectionString(
        iotConnectionString
    );

    if (!HostName || !SharedAccessKeyName || !SharedAccessKey) {
        throw new Error("Invalid IoT Hub connection string format.");
    }

    const iotHubName = HostName.split(".")[0];

    if (!iotHubName) {
        throw new Error("IoT Hub name extraction failed from the connection string.");
    }

    const sasToken = createSasToken(
        `${HostName}/messages/events`,
        SharedAccessKey,
        SharedAccessKeyName,
        5 // Token validity in minutes
    );

    const connectionOpts = {
        transport: "tls",
        host: HostName,
        hostname: HostName,
        username: `${SharedAccessKeyName}@sas.root.${iotHubName}`,
        port: 5671,
        reconnect: false,
        password: sasToken
    };

    const connection = new Connection(connectionOpts);
    await connection.open();

    const receiver = await connection.createReceiver({
        source: { address: `amqps://${HostName}/messages/events/$management` }
    });

    return new Promise((resolve, reject) => {
        receiver.on(ReceiverEvents.receiverError, (context) => {
            const error = context.receiver && context.receiver.error;
            if (isAmqpError(error) && error.condition === "amqp:link:redirect") {
                const hostname = error.info && error.info.hostname;
                const entityPathMatch = error.info.address.match(/5671\/(.*)\/\$management/i);

                if (!hostname) {
                    reject(error);
                } else if (!entityPathMatch || !entityPathMatch[1]) {
                    const errorMsg = `Failed to parse Event Hub name from address: ${error.info.address}`;
                    reject(new Error(errorMsg));
                } else {
                    const entityPath = entityPathMatch[1];
                    resolve(`Endpoint=sb://${hostname}/;EntityPath=${entityPath};SharedAccessKeyName=${SharedAccessKeyName};SharedAccessKey=${SharedAccessKey}`);
                }
            } else {
                reject(error);
            }
            connection.close().catch(() => {/* Handle close error */});
        });
    });
}

module.exports = {
    convertToEventHubsCompatibleString
};
