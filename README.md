# Beacon250

**A hyper-local community safety network powered by Alexa+, MCP, real-time communication, and Amazon Location Service.**

Beacon250 is a hackathon prototype designed to bridge the critical minutes between an emergency beginning and professional help arriving. When a user activates an SOS, Beacon250 identifies eligible verified nearby households and security personnel within approximately **250 metres**, alerts them in real time, and provides live incident location and responder coordination.

## Problem

During an emergency, police, ambulance, or other professional assistance may take several minutes to arrive.

At the same time, trusted residents, apartment security personnel, or other verified responders may already be only a few hundred metres away.

Beacon250 explores how a hyper-local safety network can help coordinate those nearby responders during the first critical minutes of an emergency.

## Solution

A user can activate Beacon250 using:

- the in-app SOS button
- a simulated Alexa+ voice experience

Once activated, Beacon250:

1. obtains the user's current location,
2. identifies demo responders near the emergency,
3. filters responders to an approximately 250 m response zone,
4. excludes the requesting household from receiving its own responder alert,
5. sends real-time alerts to eligible households and security,
6. shares the active victim location during the incident,
7. provides responder map and pedestrian-route guidance,
8. allows responders to acknowledge that they are responding,
9. shows those acknowledgements to the victim, and
10. stops emergency location sharing when the user marks themselves safe.

## Key Features

### SOS Activation

Users can trigger an emergency using a large SOS control.

The application requests browser geolocation and activates the Beacon250 emergency workflow.

### Alexa+ Experience

Beacon250 includes a simulated Alexa+ web experience.

A user can say:

`Alexa, I need help`

The voice request is sent through the Alexa gateway to the self-hosted MCP server, which invokes the Beacon250 SOS workflow.

This hackathon prototype demonstrates the Alexa+ interaction through a simulated web experience rather than a deployed physical Alexa device.

### Model Context Protocol

Beacon250 includes a self-hosted MCP server using Streamable HTTP.

Current MCP capabilities include:

- Beacon250 service/status checking
- emergency SOS activation

The MCP layer connects the Alexa+ experience to the emergency-response workflow.

### 250 Metre Responder Filtering

Beacon250 evaluates demo responder locations relative to the victim.

Example responder configuration:

- House A — approximately 80 m
- House B — approximately 140 m
- Security Guard — approximately 190 m
- House C — approximately 230 m
- House D — approximately 420 m

Only responders inside the configured response radius are eligible.

The household that activates the SOS is excluded from receiving its own emergency responder alert.

### Real-Time Communication

Socket.IO is used for real-time communication between the victim and nearby responder interfaces.

The system supports:

- emergency alerts
- live victim-location updates
- household acknowledgement
- security acknowledgement
- incident resolution

### Amazon Location Service

Amazon Location Service is used to support the mapping and route experience.

The application displays:

- live incident location
- the 250 m response radius
- responder position
- pedestrian route guidance
- estimated route distance
- estimated walking time

Responder eligibility is based on approximate straight-line distance, while pedestrian route distance follows available roads and paths, so route distance may be longer.

### Household Response

A nearby verified household can receive the emergency alert and choose:

`I'M RESPONDING`

The victim then receives a community-response confirmation.

### Security Response

The verified Security Guard profile can also acknowledge the emergency.

The victim can see both household and security acknowledgement simultaneously.

### Responder Safety Actions

The responder interface provides non-confrontational assistance options such as:

- Turn Lights On
- Call 112
- Observe Safely
- Mute Alarm
- I'm Responding

### Incident Resolution

When the victim is safe, they can choose:

`I'M SAFE — END SOS`

This resolves the active incident, clears responder alerts, stops live-location sharing, and resets the emergency state.

## Demo Profiles

Beacon250 uses simulated verified identities for the hackathon demonstration.

Available demo profiles include:

### House A
Verified Household

### House B
Verified Household

### Security Guard
Verified Security

A demo profile-selection screen is provided when the application is opened.

Selected profiles are stored locally in the browser for demonstration purposes.

Production-grade authentication, residence verification, or identity verification is outside the scope of this prototype.

## Architecture

```text
User
  |
  |-- SOS Button
  |
  |-- Alexa+ Simulated Experience
          |
          v
     Alexa Gateway
          |
          v
     MCP Server
          |
          v
  Beacon250 Backend
  Express + Socket.IO
          |
     +----+----+
     |         |
     v         v
 Household   Security
 Responder   Responder
     |         |
     +----+----+
          |
          v
  Response Confirmation
          |
          v
        Victim

Amazon Location Service
          |
          v
Maps + Pedestrian Routing
```

## Technology Stack

### Frontend

- React
- Vite
- JavaScript
- MapLibre
- Turf.js
- Browser Geolocation API
- Web Speech API

### Backend

- Node.js
- Express
- Socket.IO

### Amazon / Hackathon Integration

- Alexa+ simulated experience
- Model Context Protocol
- Amazon Location Service

## Project Structure

```text
Beacon250/
|
|-- backend/
|   |-- server.js
|   |-- mcpServer.mjs
|   |-- mcpTestClient.mjs
|   |-- alexaGateway.mjs
|   |-- package.json
|
|-- frontend/
|   |-- src/
|   |   |-- BeaconHome.jsx
|   |   |-- BeaconHome.css
|   |   |-- AlexaSimulator.jsx
|   |   |-- SafetyMap.jsx
|   |   |-- App.jsx
|   |   |-- main.jsx
|   |
|   |-- package.json
|
|-- .gitignore
|-- README.md
|-- LICENSE
```

## Running Beacon250 Locally

### Requirements

Install:

- Node.js
- npm
- Google Chrome or Microsoft Edge

Chrome or Edge is recommended for the Alexa+ voice demonstration because browser speech-recognition support can vary between environments.

### 1. Clone the Repository

```bash
git clone https://github.com/tsrthanmayi-12/Beacon250.git
cd Beacon250
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

### 4. Configure Amazon Location

Create:

```text
frontend/.env
```

The real `.env` file is intentionally excluded from GitHub to protect API credentials.

Add the Amazon Location configuration required by `SafetyMap.jsx` using your own Amazon Location API credentials.

The current prototype uses the AWS region:

```text
ap-south-1
```

Never commit API keys or secret credentials to the repository.

### 5. Start the Backend

From:

```text
backend/
```

run:

```bash
node server.js
```

Backend:

```text
http://localhost:5000
```

### 6. Start the MCP Server

In another terminal:

```bash
cd backend
node mcpServer.mjs
```

MCP endpoint:

```text
http://localhost:5001/mcp
```

### 7. Start the Alexa Gateway

In another terminal:

```bash
cd backend
node alexaGateway.mjs
```

Gateway:

```text
http://localhost:5002
```

### 8. Start the Frontend

In another terminal:

```bash
cd frontend
npm run dev
```

Frontend:

```text
http://localhost:5173/
```

## Recommended Demo Flow

1. Open Beacon250 in Google Chrome or Microsoft Edge.
2. Select House A as the demo identity.
3. Open a second browser window/profile as House B.
4. Open another window/profile as Security Guard.
5. From House A, open the Alexa+ emergency assistant.
6. Say:

   `Alexa, I need help`

7. Beacon250 activates the SOS.
8. House A becomes the victim and does not receive its own responder alert.
9. House B and Security Guard receive the nearby emergency.
10. Show the responder map and Amazon Location pedestrian route.
11. House B selects `I'M RESPONDING`.
12. Security selects `I'M RESPONDING`.
13. House A sees both community and security response confirmations.
14. House A selects `I'M SAFE — END SOS`.
15. The active emergency and temporary location sharing are cleared.

## Safety and Privacy Design

Beacon250 is a prototype and is not a replacement for professional emergency services.

The application is designed around several safety principles:

- explicit SOS activation does not depend on an AI decision,
- responders are encouraged to assist safely rather than physically confront a threat,
- users can call emergency services through the responder interface,
- exact live victim location is intended to be available only during the active emergency,
- incident-location sharing ends when the victim marks themselves safe.

The hackathon version simulates verified responder identities.

A production implementation would require strong authentication, residence verification, authorization, abuse prevention, secure storage, encryption, logging, emergency-services integration, and additional privacy controls.

## Prototype Limitations

The current hackathon prototype:

- uses simulated responder identities and demo responder locations,
- is designed primarily for one active demonstration incident at a time,
- does not provide production-grade identity verification,
- does not replace police, ambulance, or emergency-service systems,
- depends on browser geolocation accuracy,
- uses a simulated Alexa+ web experience instead of a physical Alexa deployment.

## Future Scope

Potential future improvements include:

- production authentication and verified-residence onboarding,
- apartment/community administration,
- secure responder verification,
- multi-incident support,
- notification delivery to mobile devices,
-