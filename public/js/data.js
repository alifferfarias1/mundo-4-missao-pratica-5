/* eslint-disable max-classes-per-file */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

$(document).ready(() => {
  // Determina o protocolo correto para WebSocket (wss:// se estiver em SSL)
  const protocol = document.location.protocol.startsWith('https') ? 'wss://' : 'ws://';
  const webSocket = new WebSocket(protocol + location.host);

  // Classe para armazenar os últimos N pontos de telemetria de um dispositivo
  class DeviceData {
    constructor(deviceId) {
      this.deviceId = deviceId;
      this.maxLen = 50; // Limite de dados armazenados
      this.timeData = new Array(this.maxLen);
      this.temperatureData = new Array(this.maxLen);
      this.humidityData = new Array(this.maxLen);
    }

    addData(time, temperature, humidity) {
      this.timeData.push(time);
      this.temperatureData.push(temperature);
      this.humidityData.push(humidity || null);

      // Remove os dados mais antigos quando o limite é excedido
      if (this.timeData.length > this.maxLen) {
        this.timeData.shift();
        this.temperatureData.shift();
        this.humidityData.shift();
      }
    }
  }

  // Classe que gerencia todos os dispositivos que enviam telemetria
  class TrackedDevices {
    constructor() {
      this.devices = [];
    }

    // Encontra um dispositivo pelo ID
    findDevice(deviceId) {
      return this.devices.find(device => device.deviceId === deviceId);
    }

    getDevicesCount() {
      return this.devices.length;
    }
  }

  const trackedDevices = new TrackedDevices();

  // Configuração dos dados do gráfico
  const chartData = {
    datasets: [
      {
        fill: false,
        label: 'Temperature',
        yAxisID: 'Temperature',
        borderColor: 'rgba(255, 204, 0, 1)',
        pointBorderColor: 'rgba(255, 204, 0, 1)',
        backgroundColor: 'rgba(255, 204, 0, 0.4)',
        pointHoverBackgroundColor: 'rgba(255, 204, 0, 1)',
        pointHoverBorderColor: 'rgba(255, 204, 0, 1)',
        spanGaps: true,
      },
      {
        fill: false,
        label: 'Humidity',
        yAxisID: 'Humidity',
        borderColor: 'rgba(24, 120, 240, 1)',
        pointBorderColor: 'rgba(24, 120, 240, 1)',
        backgroundColor: 'rgba(24, 120, 240, 0.4)',
        pointHoverBackgroundColor: 'rgba(24, 120, 240, 1)',
        pointHoverBorderColor: 'rgba(24, 120, 240, 1)',
        spanGaps: true,
      }
    ]
  };

  // Configurações dos eixos do gráfico
  const chartOptions = {
    scales: {
      yAxes: [
        {
          id: 'Temperature',
          type: 'linear',
          scaleLabel: {
            labelString: 'Temperature (ºC)',
            display: true,
          },
          position: 'left',
          ticks: {
            suggestedMin: 0,
            suggestedMax: 100,
            beginAtZero: true
          }
        },
        {
          id: 'Humidity',
          type: 'linear',
          scaleLabel: {
            labelString: 'Humidity (%)',
            display: true,
          },
          position: 'right',
          ticks: {
            suggestedMin: 0,
            suggestedMax: 100,
            beginAtZero: true
          }
        }
      ]
    }
  };

  // Seleciona o elemento canvas para renderizar o gráfico
  const ctx = document.getElementById('iotChart').getContext('2d');
  const myLineChart = new Chart(ctx, {
    type: 'line',
    data: chartData,
    options: chartOptions,
  });

  // Gerencia a lista de dispositivos e atualiza o gráfico com base na seleção
  let needsAutoSelect = true;
  const deviceCount = document.getElementById('deviceCount');
  const listOfDevices = document.getElementById('listOfDevices');

  function onSelectionChange() {
    const device = trackedDevices.findDevice(listOfDevices[listOfDevices.selectedIndex].text);
    if (device) {
      chartData.labels = device.timeData;
      chartData.datasets[0].data = device.temperatureData;
      chartData.datasets[1].data = device.humidityData;
      myLineChart.update();
    }
  }

  listOfDevices.addEventListener('change', onSelectionChange, false);

  // Recebe mensagens do WebSocket e processa os dados recebidos
  webSocket.onmessage = function onMessage(message) {
    try {
      const messageData = JSON.parse(message.data);
      console.log('Dados recebidos:', messageData);

      // Verifica se a mensagem contém dados válidos
      if (!messageData.MessageDate || (!messageData.IotData.temperature && !messageData.IotData.humidity)) {
        return; // Ignora mensagens incompletas
      }

      // Encontra ou cria um dispositivo para armazenar os dados
      let existingDeviceData = trackedDevices.findDevice(messageData.DeviceId);

      if (existingDeviceData) {
        existingDeviceData.addData(messageData.MessageDate, messageData.IotData.temperature, messageData.IotData.humidity);
      } else {
        const newDeviceData = new DeviceData(messageData.DeviceId);
        trackedDevices.devices.push(newDeviceData);
        deviceCount.innerText = trackedDevices.getDevicesCount() === 1 ? '1 device' : `${trackedDevices.getDevicesCount()} devices`;
        newDeviceData.addData(messageData.MessageDate, messageData.IotData.temperature, messageData.IotData.humidity);

        // Adiciona o dispositivo na lista de seleção
        const node = document.createElement('option');
        node.appendChild(document.createTextNode(messageData.DeviceId));
        listOfDevices.appendChild(node);

        // Seleciona automaticamente o primeiro dispositivo adicionado
        if (needsAutoSelect) {
          needsAutoSelect = false;
          listOfDevices.selectedIndex = 0;
          onSelectionChange();
        }
      }

      myLineChart.update();
    } catch (err) {
      console.error('Erro ao processar a mensagem:', err);
    }
  };
});
