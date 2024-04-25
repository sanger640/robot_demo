//current best version

let map;
let drawingManager;
let selectedShape;
let allRoutes = {};

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 43.6532, lng: -79.3832 },
      zoom: 8,
      mapTypeId: google.maps.MapTypeId.HYBRID,
  });

  drawingManager = new google.maps.drawing.DrawingManager({
    drawingControl: false,
    polylineOptions: {
      strokeWeight: 2,
      clickable: true,
      editable: false, // Set editable to false after completion
      zIndex: 1,
      strokeColor: '#FF0000' // Changed the color to red for better visibility
    }
  });

  drawingManager.setMap(map);

   google.maps.event.addListener(drawingManager, 'overlaycomplete', function(e) {
    if (e.type === 'polyline') {
      selectedShape = e.overlay;
      google.maps.event.addListener(selectedShape.getPath(), 'set_at', saveNewRoute);
      google.maps.event.addListener(selectedShape.getPath(), 'insert_at', saveNewRoute);
      drawingManager.setDrawingMode(null);
      document.getElementById('saveRoute').style.display = 'inline'; // Show save button immediately after drawing a segment
    }
  });

  document.getElementById('startDrawing').addEventListener('click', function() {
    if (selectedShape) {
      selectedShape.setMap(null);
      selectedShape = null;
    }
    drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYLINE);
    // document.getElementById('saveRoute').style.display = 'none';
  });

  document.getElementById('saveRoute').addEventListener('click', saveNewRoute);

  // Initially hide the save button until drawing starts
  // document.getElementById('saveRoute').style.display = 'none';

  loadRoutes(); // Load saved routes when the page loads
}

function saveNewRoute() {
  if (selectedShape) {
    const routeName = prompt("Enter a name for this route:", `Route_${new Date().getTime()}`);
    if (routeName) {
      saveRoute(routeName, selectedShape.getPath().getArray());
      selectedShape = null;
      document.getElementById('saveRoute').style.display = 'none';
    }
  }
}
let allPolylines = {};

function saveRoute(name, path) {
  allRoutes[name] = {
    path: path.map(coord => ({ lat: coord.lat(), lng: coord.lng() }))
  };
  drawRoute(name, allRoutes[name].path); // Draw the route immediately
  saveRoutes();
  updateRouteList();
  location.reload(); // Refresh the page
}

function saveRoutes() {
  localStorage.setItem('savedRoutes', JSON.stringify(allRoutes));
}

function loadRoutes() {
  const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '{}');
  Object.keys(savedRoutes).forEach(routeName => {
    const route = savedRoutes[routeName];
    allRoutes[routeName] = route; // Add to the current session
    drawRoute(routeName, route.path);
  });
  updateRouteList(); // Update the route list display
}
function updateRouteVisibility(routeName) {
  const polyline = allPolylines[routeName];
  allRoutes[routeName].visible = polyline.getMap() != null;
  if (polyline.getMap()) {
    allRoutes[routeName].visible = true;
  } else {
    allRoutes[routeName].visible = false;
  }
}
function drawRoute(name, path) {
  const polyline = new google.maps.Polyline({
    path: path,
    strokeColor: '#1E90FF',
    strokeOpacity: 1.0,
    strokeWeight: 2,
    map: null
  });
  // polyline.setMap(map);
  allPolylines[name] = polyline; // Store the polyline in the allPolylines object
}


function updateRouteList() {
  const routeList = document.getElementById('routeList');
  routeList.innerHTML = ''; // Clear the list before adding new items

  Object.keys(allRoutes).forEach(routeName => {
    // Create a container for each route
    const routeDiv = document.createElement('div');
    routeDiv.className = 'route';

    // Create and style the name of the route
    const nameSpan = document.createElement('span');
    nameSpan.textContent = routeName;
    nameSpan.className = 'route-name';
    

    // Create the 'Show' button
    const showButton = document.createElement('button');
    showButton.textContent = 'Set';
    showButton.className = 'route-button show-button';
    showButton.onclick = function() {
      toggleRouteVisibility(routeName);
      updateLog(routeName);
    };

    // Create the 'Delete' button
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete Route';
    deleteButton.className = 'route-button delete-button';
    deleteButton.onclick = function() {
      deleteRoute(routeName);
    };

    // Append the name and buttons to the route container
    routeDiv.appendChild(nameSpan);
    routeDiv.appendChild(showButton);
    routeDiv.appendChild(deleteButton);

    // Append the route container to the list in the sidebar
    routeList.appendChild(routeDiv);
  });
}

let routeTimes = {};

function toggleRouteVisibility(routeName) {
  const polyline = allPolylines[routeName];
  if (polyline.getMap()) {
    polyline.setMap(null);
    allRoutes[routeName].visible = false;
    removeAssociatedTasks(routeName);
  } else {
    polyline.setMap(map);
    allRoutes[routeName].visible = true;
    activeRoutes.push(routeName);

    // Calculate and store the distance
    if (!routeDistances[routeName]) {
      routeDistances[routeName] = calculateRouteDistance(polyline);
    }

    if (polyline.getPath().getLength() > 0) {
      const firstLatLng = polyline.getPath().getAt(0);
      map.setCenter(firstLatLng);
      map.setZoom(17);
    }

    manageRouteContinuationAndRecharge(routeName);
  }
  updateLog();
}

let routeDistances = {}; // Stores the distances of the routes


function removeAssociatedTasks(routeName) {
  // Access the specific robot log based on the current robot
  let robotLog = robotLogs[currentRobot];

  // Remove the main route first if it exists
  const mainRouteIndex = robotLog.activeRoutes.indexOf(routeName);
  if (mainRouteIndex > -1) {
    robotLog.activeRoutes.splice(mainRouteIndex, 1);
    delete robotLog.routeTimes[routeName];
    delete robotLog.routeDistances[routeName];
  }

  // Now check and remove the continuation and recharge tasks
  const continuationRouteName = `${routeName} cont`;
  const rechargeRouteName = 'recharge';

  // Check for continuation task
  const contIndex = robotLog.activeRoutes.indexOf(continuationRouteName);
  if (contIndex > -1) {
    robotLog.activeRoutes.splice(contIndex, 1);
    delete robotLog.routeTimes[continuationRouteName];
    delete robotLog.routeDistances[continuationRouteName];
  }

  // Check for recharge task, which might be associated with other routes as well
  robotLog.activeRoutes = robotLog.activeRoutes.filter(r => r !== rechargeRouteName);
  delete robotLog.routeTimes[rechargeRouteName];
  delete robotLog.routeDistances[rechargeRouteName];
}


let robotLogs = {
  'robot1': { activeRoutes: [], routeTimes: {}, routeDistances: {} },
  'robot2': { activeRoutes: [], routeTimes: {}, routeDistances: {} },
  'robot3': { activeRoutes: [], routeTimes: {}, routeDistances: {} },
  'robot4': { activeRoutes: [], routeTimes: {}, routeDistances: {} },
  'robot5': { activeRoutes: [], routeTimes: {}, routeDistances: {} },
  'robot6': { activeRoutes: [], routeTimes: {}, routeDistances: {} },
  'robot7': { activeRoutes: [], routeTimes: {}, routeDistances: {} },
  'robot8': { activeRoutes: [], routeTimes: {}, routeDistances: {} },
  'robot9': { activeRoutes: [], routeTimes: {}, routeDistances: {} }
};
let currentRobot = 'robot1';

function manageRouteContinuationAndRecharge(routeName) {
  let time = parseInt(routeTimes[routeName], 10);
  if (time > 10) {
    let remainingTime = time - 10;
    routeTimes[routeName] = '10 hours';
    routeTimes[`${routeName} cont`] = `${remainingTime} hours`;
    activeRoutes.push(`${routeName} cont`);

    if (!allRoutes['recharge']) {
      let rechargeIndex = activeRoutes.indexOf(routeName) + 1;
      activeRoutes.splice(rechargeIndex, 0, 'recharge');
      routeTimes['recharge'] = '4 hours';
      allRoutes['recharge'] = { visible: true };
    }
  }
}
let activeRoutes = [];



function calculateRouteDistance(polyline) {
  let totalDistance = 0;
  const path = polyline.getPath();
  const pathLength = path.getLength();

  for (let i = 0; i < pathLength - 1; i++) {
    const from = path.getAt(i);
    const to = path.getAt(i + 1);
    totalDistance += google.maps.geometry.spherical.computeDistanceBetween(from, to);
  }

  // Convert distance from meters to kilometers
  return (totalDistance / 1000).toFixed(2); // Rounded to two decimal places
}

document.getElementById('setTimeButton').addEventListener('click', () => {
  if (activeRoutes.length === 0) {
    alert('No active route to set time for.');
    return;
  }

  let routeName = activeRoutes[activeRoutes.length - 1]; // Get the last active route
  let inputTime = prompt('Enter time for this route in hours:', '');
  let time = parseInt(inputTime, 10);

  if (isNaN(time)) {
    alert('Please enter a valid number of hours.');
    return;
  }

  // Check if the time exceeds 10 hours
  if (time > 10) {
    let remainingTime = time - 10;
    routeTimes[routeName] = '10 hours'; // Set first part to 10 hours
    routeTimes[`${routeName} cont`] = `${remainingTime} hours`; // Continue the route with remaining time
    activeRoutes.push(`${routeName} cont`); // Add continued route to active routes

    // Insert recharge task in between
    let rechargeIndex = activeRoutes.length - 2; // Right before the last item
    activeRoutes.splice(rechargeIndex + 1, 0, 'recharge');
    routeTimes['recharge'] = '2 hours';

    allRoutes['recharge'] = { visible: true }; // Add dummy visible property for recharge
  } else {
    routeTimes[routeName] = `${time} hours`; // Set time as is if 10 hours or less
  }

  updateLog();
});

// Function to switch between robots
function switchRobot(selectedRobot) {
  // Save current log state before switching
  robotLogs[currentRobot].activeRoutes = [...activeRoutes];
  robotLogs[currentRobot].routeTimes = {...routeTimes};
  robotLogs[currentRobot].routeDistances = {...routeDistances};

  // Clear current log state
  activeRoutes = [];
  routeTimes = {};
  routeDistances = {};
  updateLog();

  // Set current robot to the selected one
  currentRobot = selectedRobot;

  // Restore the log state for the new robot
  const newRobotLog = robotLogs[selectedRobot];
  activeRoutes = [...newRobotLog.activeRoutes];
  routeTimes = {...newRobotLog.routeTimes};
  routeDistances = {...newRobotLog.routeDistances};
  updateLog();
}

// Event listeners for robot buttons
document.querySelectorAll('.robot-button').forEach(button => {
  button.addEventListener('click', function() {
    const selectedRobot = this.getAttribute('data-robot');
    switchRobot(selectedRobot);
  });
});

// Initial log update
document.getElementById('clearLogButton').addEventListener('click', function() {
  // Clear the log entries for the current robot
  activeRoutes = [];
  routeTimes = {};
  routeDistances = {};

  // Update the log to reflect the cleared state
  updateLog();
});

function updateLog() {
  const log = document.getElementById('log');
  log.innerHTML = 'Task Running:<br>';

  activeRoutes.forEach(routeName => {
    const time = routeTimes[routeName] || 'Time not set';
    const distance = routeDistances[routeName]  || '1';
    log.innerHTML += `> ${routeName} | ${distance} km | ${time} <br> `;
  });
  log.innerHTML += '>';
}

function deleteRoute(routeName) {
  if (confirm(`Are you sure you want to delete route "${routeName}"?`)) {
    const polyline = allPolylines[routeName];
    if (polyline) {
      polyline.setMap(null); // Hide the route from the map
    }
    delete allRoutes[routeName]; // Remove the route from the allRoutes object
    saveRoutes(); // Update local storage
    updateRouteList(); // Update the route list display
  }
}

window.initMap = initMap; // Expose initMap to the global scope