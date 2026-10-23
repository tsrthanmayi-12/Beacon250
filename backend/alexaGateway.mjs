import express from "express";
import cors from "cors";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const app = express();

app.use(cors());
app.use(express.json());

const mcpClient = new Client({
  name: "beacon250-alexa-simulator",
  version: "1.0.0",
});

const transport =
  new StreamableHTTPClientTransport(
    new URL("https://beacon250-mcp.onrender.com/mcp")
  );

console.log("Connecting Alexa+ Simulator to Beacon250 MCP...");

await mcpClient.connect(transport);

console.log("Alexa+ Simulator connected to MCP.");

app.post("/alexa-command", async (req, res) => {
  try {
   const {
  text,
  latitude = 12.9716,
  longitude = 77.5946,
  requesterName,
} = req.body;
    if (!text) {
      return res.status(400).json({
        response: "No voice command was provided.",
      });
    }

    const command = text.toLowerCase();

    const emergencyWords = [
      "help",
      "sos",
      "emergency",
      "unsafe",
      "danger",
      "save me",
      "followed",
      "following me",
    ];

    const isEmergency =
      emergencyWords.some((word) =>
        command.includes(word)
      );

    if (isEmergency) {
      const result = await mcpClient.callTool({
  name: "trigger_sos",
  arguments: {
    latitude,
    longitude,
    requesterName,
  },
});
      return res.json({
        action: "trigger_sos",
        response:
          result.content?.[0]?.text ||
          "Beacon250 SOS activated.",
      });
    }

    if (
      command.includes("status") ||
      command.includes("beacon")
    ) {
      const result = await mcpClient.callTool({
        name: "beacon250_status",
        arguments: {},
      });

      return res.json({
        action: "beacon250_status",
        response:
          result.content?.[0]?.text ||
          "Beacon250 is online.",
      });
    }

    return res.json({
      action: "unknown",
      response:
        "I didn't detect an emergency request. Say 'Alexa, I need help' to activate Beacon250.",
    });
  } catch (error) {
    console.error("Alexa command failed:", error);

    res.status(500).json({
      response:
        "Beacon250 could not process the request.",
    });
  }
});

app.get("/", (req, res) => {
  res.send("Beacon250 Alexa+ Simulator Gateway is running");
});

const PORT = process.env.PORT || 5002;

app.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------");
  console.log("Beacon250 Alexa Gateway is running");
  console.log(`Port: ${PORT}`);
  console.log("--------------------------------");
});