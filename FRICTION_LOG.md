# Beacon250 Friction Log

## 1. MCP Streamable HTTP Setup

**Task attempted:**  
Build a self-hosted MCP server for the Alexa+ track using Streamable HTTP.

**Steps taken:**  
Implemented an MCP server in Node.js, exposed the MCP endpoint, created the `trigger_sos` tool, and connected the Alexa+ web simulator through an Alexa gateway.

**Expected result:**  
The Alexa+ simulator should reliably call the MCP tool and activate the Beacon250 emergency workflow.

**Actual result:**  
Initial integration required multiple iterations to correctly pass the victim location and requester identity through the Alexa gateway to the MCP server.

**Severity:** Important

**Workaround used:**  
Added an Alexa gateway layer and explicitly passed `latitude`, `longitude`, and `requesterName` into the MCP tool invocation.

**Actionable suggestion:**  
Provide more complete end-to-end examples showing a browser-based simulated Alexa+ experience calling a self-hosted Streamable HTTP MCP server, including client initialization, tool invocation, and error handling.

---

## 2. Browser Voice Recognition During Alexa+ Simulation

**Task attempted:**  
Use browser speech recognition to demonstrate the voice command “Alexa, I need help.”

**Steps taken:**  
Implemented browser speech recognition inside the Alexa+ simulated experience and tested it in the VS Code integrated browser and standard Chromium browsers.

**Expected result:**  
Speech recognition should work consistently in the development browser.

**Actual result:**  
Voice recognition did not work reliably in the VS Code integrated browser, while the exact same implementation worked correctly in Google Chrome and Microsoft Edge.

**Severity:** Important

**Workaround used:**  
Used a standard Chromium browser for the final voice demonstration while retaining typed-command fallback support.

**Actionable suggestion:**  
Developer documentation for simulated voice experiences could explicitly mention browser Web Speech API compatibility and recommend supported browsers for reliable demonstrations.

---

## 3. Amazon Location Route Distance vs. Response Radius

**Task attempted:**  
Show nearby responder eligibility within 250 metres while also displaying a pedestrian route to the victim.

**Steps taken:**  
Calculated responder eligibility using straight-line distance and requested pedestrian routing through Amazon Location Service.

**Expected result:**  
The route distance would be reasonably close to the straight-line responder distance.

**Actual result:**  
Pedestrian route distance could be significantly longer because the route follows available roads and paths.

**Severity:** Nice-to-have

**Workaround used:**  
Kept eligibility and route distance clearly separated in the UI and explained that the 250 m eligibility radius is straight-line distance while the route reflects real traversable paths.

**Actionable suggestion:**  
Documentation and sample applications could more explicitly demonstrate the difference between proximity/geospatial filtering and route distance.

---

## 4. Live Browser Geolocation Accuracy

**Task attempted:**  
Use browser geolocation for live emergency tracking.

**Steps taken:**  
Used `navigator.geolocation.getCurrentPosition()` for initial SOS location and `watchPosition()` for live updates.

**Expected result:**  
The browser would provide consistently high-accuracy location data.

**Actual result:**  
Desktop and laptop location accuracy varied depending on device and network conditions.

**Severity:** Nice-to-have

**Workaround used:**  
Displayed GPS accuracy in the UI and treated the project as a prototype rather than presenting browser location as exact.

**Actionable suggestion:**  
Provide stronger best-practice guidance for developers building safety/location demos on how to communicate location accuracy and device limitations to users.