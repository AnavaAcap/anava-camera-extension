/**
 * Popup UI Controller - Single-Page Flow
 * Scan → Select → Configure → Deploy
 */

import { CameraDiscoveryService } from './src/services/CameraDiscovery.js';
import { AcapDeploymentService } from './src/services/AcapDeploymentService.js';

// State
let discoveryService = new CameraDiscoveryService();
let deploymentService = new AcapDeploymentService();
let discoveredCameras = [];
let selectedCameras = new Set();
let currentStep = 1;

// DOM Elements
const stepScan = document.getElementById('step-scan');
const stepSelect = document.getElementById('step-select');
const stepConfigure = document.getElementById('step-configure');
const stepDeploy = document.getElementById('step-deploy');

const networkRangeInput = document.getElementById('network-range');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const intensitySelect = document.getElementById('intensity');
const startScanBtn = document.getElementById('start-scan');
const testSingleIpBtn = document.getElementById('test-single-ip');

const progressSection = document.getElementById('progress-section');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

const cameraCount = document.getElementById('camera-count');
const cameraList = document.getElementById('camera-list');
const continueConfigureBtn = document.getElementById('continue-configure');

const selectedCount = document.getElementById('selected-count');
const licenseKeyInput = document.getElementById('license-key');
const customerIdInput = document.getElementById('customer-id');
const firebaseConfigInput = document.getElementById('firebase-config');
const geminiConfigInput = document.getElementById('gemini-config');
const backToSelectBtn = document.getElementById('back-to-select');
const startDeployBtn = document.getElementById('start-deploy');

const deployStatus = document.getElementById('deploy-status');
const finishDeployBtn = document.getElementById('finish-deploy');

// Step Navigation
function goToStep(step) {
  currentStep = step;

  // Update step indicators
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.remove('active', 'completed');
    if (i + 1 < step) {
      el.classList.add('completed');
    } else if (i + 1 === step) {
      el.classList.add('active');
    }
  });

  // Show/hide step sections
  [stepScan, stepSelect, stepConfigure, stepDeploy].forEach((section, i) => {
    section.classList.toggle('active', i + 1 === step);
  });
}

// DEBUG: Test single IP
testSingleIpBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const testIp = '192.168.50.156';

  if (!username || !password) {
    alert('Please enter credentials');
    return;
  }

  testSingleIpBtn.disabled = true;
  console.log(`\n\n${'*'.repeat(100)}`);
  console.log(`DEBUG TEST: Testing ${testIp} directly (bypassing network scan)`);
  console.log(`${'*'.repeat(100)}\n\n`);

  try {
    const camera = await discoveryService.debugTestSpecificIP(testIp, username, password);

    if (camera) {
      console.log(`\n✅ DEBUG TEST SUCCESS: Camera found!`, camera);
      alert(`Camera found at ${testIp}!\nModel: ${camera.model}\nFirmware: ${camera.firmwareVersion}`);
    } else {
      console.log(`\n❌ DEBUG TEST FAILED: No camera found (null returned)`);
      alert(`No camera found at ${testIp}. Check console for details.`);
    }
  } catch (error) {
    console.error(`\n❌ DEBUG TEST ERROR:`, error);
    alert(`Error testing ${testIp}: ${error.message}`);
  } finally {
    testSingleIpBtn.disabled = false;
  }
});

// Step 1: Network Scan
startScanBtn.addEventListener('click', async () => {
  const networkRange = networkRangeInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const intensity = intensitySelect.value;

  if (!networkRange || !username || !password) {
    alert('Please fill in all required fields');
    return;
  }

  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(networkRange)) {
    alert('Invalid network range format. Use CIDR notation (e.g., 192.168.50.0/24)');
    return;
  }

  startScanBtn.disabled = true;
  progressSection.style.display = 'block';
  discoveredCameras = [];

  try {
    const cameras = await discoveryService.scanNetworkForCameras(
      networkRange,
      username,
      password,
      {
        intensity,
        onProgress: (progress) => {
          progressText.textContent = `Scanning ${progress.ip}...`;

          // Calculate progress percentage
          const ipParts = progress.ip.split('.');
          if (ipParts.length === 4) {
            const lastOctet = parseInt(ipParts[3]);
            const progressPercent = (lastOctet / 254) * 100;
            progressFill.style.width = `${Math.min(progressPercent, 100)}%`;
          }
        }
      }
    );

    discoveredCameras = cameras;

    if (cameras.length === 0) {
      alert('No cameras found. Please check your network range and credentials.');
      progressSection.style.display = 'none';
      startScanBtn.disabled = false;
      return;
    }

    // Move to selection step
    progressSection.style.display = 'none';
    displayCameras(cameras);
    goToStep(2);
  } catch (error) {
    alert(`Scan failed: ${error.message}`);
    progressSection.style.display = 'none';
  } finally {
    startScanBtn.disabled = false;
  }
});

// Step 2: Display and Select Cameras
function displayCameras(cameras) {
  cameraCount.textContent = cameras.length;
  cameraList.innerHTML = '';

  cameras.forEach(camera => {
    const card = document.createElement('div');
    card.className = 'camera-card';

    const isSupported = camera.isSupported !== false;
    const statusClass = isSupported ? '' : 'unsupported';
    const statusText = isSupported ? 'Supported' : 'Unsupported';

    card.innerHTML = `
      <div class="camera-header">
        <div class="camera-model">${camera.model}</div>
        <div class="camera-status ${statusClass}">${statusText}</div>
      </div>
      <div class="camera-details">
        <div class="camera-detail"><strong>IP:</strong> ${camera.ip}:${camera.port}</div>
        <div class="camera-detail"><strong>Firmware:</strong> ${camera.firmwareVersion || 'Unknown'}</div>
        <div class="camera-detail"><strong>Protocol:</strong> ${camera.protocol?.toUpperCase()}</div>
        <div class="camera-detail"><strong>Serial:</strong> ${camera.serialNumber || 'N/A'}</div>
      </div>
    `;

    if (!isSupported) {
      const reason = document.createElement('div');
      reason.style.marginTop = '8px';
      reason.style.fontSize = '11px';
      reason.style.color = '#f44336';
      reason.textContent = camera.unsupportedReason || 'Firmware version not supported';
      card.appendChild(reason);
    }

    card.addEventListener('click', () => {
      if (!isSupported) return; // Don't allow selecting unsupported cameras

      if (selectedCameras.has(camera.id)) {
        selectedCameras.delete(camera.id);
        card.classList.remove('selected');
      } else {
        selectedCameras.add(camera.id);
        card.classList.add('selected');
      }
      updateContinueButton();
    });

    cameraList.appendChild(card);
  });
}

function updateContinueButton() {
  continueConfigureBtn.disabled = selectedCameras.size === 0;
}

continueConfigureBtn.addEventListener('click', () => {
  selectedCount.textContent = selectedCameras.size;
  goToStep(3);
  updateDeployButton();
});

// Step 3: Configuration
[licenseKeyInput, customerIdInput, firebaseConfigInput, geminiConfigInput].forEach(input => {
  input.addEventListener('input', updateDeployButton);
});

function updateDeployButton() {
  const licenseKey = licenseKeyInput.value.trim();
  const customerId = customerIdInput.value.trim();
  const firebaseConfig = firebaseConfigInput.value.trim();
  const geminiConfig = geminiConfigInput.value.trim();

  startDeployBtn.disabled = !licenseKey || !customerId || !firebaseConfig || !geminiConfig;
}

backToSelectBtn.addEventListener('click', () => {
  goToStep(2);
});

// Step 4: Deployment
startDeployBtn.addEventListener('click', async () => {
  const licenseKey = licenseKeyInput.value.trim();
  const firebaseConfigText = firebaseConfigInput.value.trim();
  const geminiConfigText = geminiConfigInput.value.trim();
  const customerId = customerIdInput.value.trim();

  // Parse configs
  let firebaseConfig, geminiConfig;
  try {
    firebaseConfig = JSON.parse(firebaseConfigText);
    geminiConfig = JSON.parse(geminiConfigText);
  } catch (error) {
    alert('Invalid JSON in Firebase or Gemini config. Please check your input.');
    return;
  }

  // Get selected cameras
  const camerasToDeply = discoveredCameras.filter(c => selectedCameras.has(c.id));

  if (camerasToDeply.length === 0) {
    alert('No cameras selected for deployment');
    return;
  }

  // Build deployment config
  const deploymentConfig = {
    firebaseConfig: {
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId,
      databaseId: firebaseConfig.databaseId || '(default)'
    },
    geminiConfig: {
      vertexApiGatewayUrl: geminiConfig.vertexApiGatewayUrl,
      vertexApiGatewayKey: geminiConfig.vertexApiGatewayKey,
      vertexGcpProjectId: geminiConfig.vertexGcpProjectId,
      vertexGcpRegion: geminiConfig.vertexGcpRegion || 'us-central1',
      vertexGcsBucketName: geminiConfig.vertexGcsBucketName
    },
    anavaKey: licenseKey,
    customerId: customerId
  };

  // Move to deployment step
  goToStep(4);
  deployStatus.innerHTML = '';
  startDeployBtn.disabled = true;

  // Deploy to each camera
  const deploymentPromises = camerasToDeply.map(async (camera) => {
    const cardId = `deploy-card-${camera.id}`;

    // Create deployment card
    const card = document.createElement('div');
    card.id = cardId;
    card.className = 'deploy-card';
    card.innerHTML = `
      <div class="deploy-card-header">
        <div class="deploy-card-title">${camera.model} (${camera.ip})</div>
        <div class="deploy-card-status">⏳ Pending</div>
      </div>
      <div class="deploy-card-progress">
        <div class="deploy-progress-bar">
          <div class="deploy-progress-fill" style="width: 0%"></div>
        </div>
        <div class="deploy-stage-text">Waiting to start...</div>
      </div>
    `;
    deployStatus.appendChild(card);

    const statusDiv = card.querySelector('.deploy-card-status');
    const progressFill = card.querySelector('.deploy-progress-fill');
    const stageText = card.querySelector('.deploy-stage-text');

    try {
      // Start deployment
      const result = await deploymentService.deployCameraComplete(
        camera,
        licenseKey,
        deploymentConfig,
        (stage, percent) => {
          // Update progress
          progressFill.style.width = `${percent}%`;
          stageText.textContent = stage;
        }
      );

      if (result.success) {
        statusDiv.textContent = '✅ Complete';
        statusDiv.style.color = '#4caf50';
        stageText.textContent = 'Deployment successful!';
      } else {
        statusDiv.textContent = '❌ Failed';
        statusDiv.style.color = '#f44336';
        stageText.textContent = result.error || 'Deployment failed';
      }
    } catch (error) {
      statusDiv.textContent = '❌ Error';
      statusDiv.style.color = '#f44336';
      stageText.textContent = error.message;
    }
  });

  // Wait for all deployments to complete
  await Promise.allSettled(deploymentPromises);

  finishDeployBtn.style.display = 'block';
  alert('Deployment complete! Check the status of each camera above.');
});

finishDeployBtn.addEventListener('click', () => {
  // Reset to start
  goToStep(1);
  selectedCameras.clear();
  discoveredCameras = [];
  progressSection.style.display = 'none';
  progressFill.style.width = '0%';
  finishDeployBtn.style.display = 'none';

  // Clear forms
  licenseKeyInput.value = '';
  customerIdInput.value = '';
  firebaseConfigInput.value = '';
  geminiConfigInput.value = '';
});

// Initialize
goToStep(1);
