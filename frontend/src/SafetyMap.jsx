import {
  useEffect,
  useRef,
  useState,
} from "react";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import * as turf from "@turf/turf";

import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(workerUrl);

function SafetyMap({
  latitude,
  longitude,
  responders,
  responderLocation = null,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  const victimMarkerRef = useRef(null);
  const responderMarkerRef = useRef(null);
  const nearbyMarkersRef = useRef([]);

  const routeRequestRef = useRef(0);
  const routeCoordinatesRef = useRef([]);

  const [routeInfo, setRouteInfo] =
    useState(null);

  const [routeSteps, setRouteSteps] =
    useState([]);

  const [routeStatus, setRouteStatus] =
    useState(
      responderLocation
        ? "Calculating rescue route..."
        : ""
    );

  const [mapStatus, setMapStatus] =
    useState("Loading satellite map...");

  const apiKey =
    import.meta.env
      .VITE_AWS_LOCATION_API_KEY;

  const region =
    import.meta.env.VITE_AWS_REGION ||
    "ap-south-1";

  // ==================================================
  // HELPERS
  // ==================================================

  function isValidCoordinate(value) {
    return Number.isFinite(
      Number(value)
    );
  }

  function fitCoordinates(
    coordinates,
    options = {}
  ) {
    const map = mapRef.current;

    if (
      !map ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      return;
    }

    const bounds =
      new maplibregl.LngLatBounds();

    coordinates.forEach(
      (coordinate) => {
        if (
          Array.isArray(coordinate) &&
          coordinate.length >= 2 &&
          isValidCoordinate(
            coordinate[0]
          ) &&
          isValidCoordinate(
            coordinate[1]
          )
        ) {
          bounds.extend([
            Number(coordinate[0]),
            Number(coordinate[1]),
          ]);
        }
      }
    );

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: 70,
        maxZoom: 18,
        duration: 900,
        ...options,
      });
    }
  }

  function clearRoute() {
    const map = mapRef.current;

    routeCoordinatesRef.current = [];
    setRouteInfo(null);
    setRouteSteps([]);

    if (!map) {
      return;
    }

    const source =
      map.getSource(
        "walking-route"
      );

    if (source) {
      source.setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  }

  function updateRouteLayer(
    coordinates
  ) {
    const map = mapRef.current;

    if (
      !map ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      return;
    }

    const source =
      map.getSource(
        "walking-route"
      );

    if (!source) {
      return;
    }

    source.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates,
      },
    });

    routeCoordinatesRef.current =
      coordinates;

    fitCoordinates(coordinates);
  }

  function recenterRescueRoute() {
    if (
      routeCoordinatesRef.current
        .length >= 2
    ) {
      fitCoordinates(
        routeCoordinatesRef.current
      );

      return;
    }

    if (responderLocation) {
      fitCoordinates([
        [
          responderLocation.longitude,
          responderLocation.latitude,
        ],
        [
          longitude,
          latitude,
        ],
      ]);
    }
  }

  // ==================================================
  // CREATE HYBRID SATELLITE MAP
  // ==================================================

  useEffect(() => {
    if (
      !isValidCoordinate(latitude) ||
      !isValidCoordinate(longitude)
    ) {
      return;
    }

    if (!apiKey) {
      console.error(
        "Amazon Location API key is missing."
      );

      setMapStatus(
        "Amazon Location API key is missing."
      );

      return;
    }

    if (
      !mapContainer.current ||
      mapRef.current
    ) {
      return;
    }

    // Hybrid =
    // satellite imagery + roads + labels
    const styleUrl =
      `https://maps.geo.${region}.amazonaws.com/v2/styles/Hybrid/descriptor?key=${encodeURIComponent(
        apiKey
      )}`;

    const map =
      new maplibregl.Map({
        container:
          mapContainer.current,

        style: styleUrl,

        center: [
          Number(longitude),
          Number(latitude),
        ],

        zoom: 17.5,

        pitch: 0,

        bearing: 0,
      });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
      }),
      "top-right"
    );

    // --------------------------------
    // VICTIM MARKER
    // --------------------------------

    victimMarkerRef.current =
      new maplibregl.Marker({
        color: "#ef4444",
      })
        .setLngLat([
          Number(longitude),
          Number(latitude),
        ])
        .setPopup(
          new maplibregl.Popup({
            offset: 20,
          }).setHTML(`
            <div style="font-family:Arial,sans-serif">
              <strong style="color:#dc2626">
                🚨 VICTIM LOCATION
              </strong>
              <br/>
              Live emergency position
            </div>
          `)
        )
        .addTo(map);

    map.on("load", () => {
      setMapStatus(
        "Hybrid satellite map active"
      );

      map.resize();

      // --------------------------------
      // 250M SAFETY ZONE
      // --------------------------------

      const safetyCircle =
        turf.circle(
          [
            Number(longitude),
            Number(latitude),
          ],
          0.25,
          {
            steps: 96,
            units:
              "kilometers",
          }
        );

      map.addSource(
        "safety-radius",
        {
          type: "geojson",
          data: safetyCircle,
        }
      );

      map.addLayer({
        id:
          "safety-radius-fill",

        type: "fill",

        source:
          "safety-radius",

        paint: {
          "fill-color":
            "#ef4444",

          "fill-opacity":
            0.13,
        },
      });

      map.addLayer({
        id:
          "safety-radius-border",

        type: "line",

        source:
          "safety-radius",

        paint: {
          "line-color":
            "#ef4444",

          "line-width": 3,

          "line-opacity":
            0.9,
        },
      });

      // --------------------------------
      // WALKING ROUTE SOURCE
      // --------------------------------

      map.addSource(
        "walking-route",
        {
          type: "geojson",

          data: {
            type:
              "FeatureCollection",

            features: [],
          },
        }
      );

      // Dark outline so blue route
      // remains visible over satellite
      map.addLayer({
        id:
          "walking-route-outline",

        type: "line",

        source:
          "walking-route",

        layout: {
          "line-join":
            "round",

          "line-cap":
            "round",
        },

        paint: {
          "line-color":
            "#ffffff",

          "line-width": 10,

          "line-opacity":
            0.9,
        },
      });

      // Main rescue route
      map.addLayer({
        id:
          "walking-route-line",

        type: "line",

        source:
          "walking-route",

        layout: {
          "line-join":
            "round",

          "line-cap":
            "round",
        },

        paint: {
          "line-color":
            "#2563eb",

          "line-width": 6,

          "line-opacity": 1,
        },
      });
    });

    map.on(
      "error",
      (event) => {
        console.error(
          "MapLibre / Amazon map error:",
          event?.error ||
            event
        );
      }
    );

    return () => {
      nearbyMarkersRef.current.forEach(
        (marker) =>
          marker.remove()
      );

      nearbyMarkersRef.current =
        [];

      if (
        responderMarkerRef.current
      ) {
        responderMarkerRef.current.remove();

        responderMarkerRef.current =
          null;
      }

      if (
        victimMarkerRef.current
      ) {
        victimMarkerRef.current.remove();

        victimMarkerRef.current =
          null;
      }

      map.remove();

      mapRef.current = null;
    };

    // Map created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==================================================
  // UPDATE VICTIM LOCATION
  // ==================================================

  useEffect(() => {
    const map =
      mapRef.current;

    if (
      !map ||
      !isValidCoordinate(latitude) ||
      !isValidCoordinate(longitude)
    ) {
      return;
    }

    if (
      victimMarkerRef.current
    ) {
      victimMarkerRef.current.setLngLat(
        [
          Number(longitude),
          Number(latitude),
        ]
      );
    }

    const safetyCircle =
      turf.circle(
        [
          Number(longitude),
          Number(latitude),
        ],
        0.25,
        {
          steps: 96,
          units:
            "kilometers",
        }
      );

    const updateCircle =
      () => {
        const source =
          map.getSource(
            "safety-radius"
          );

        if (source) {
          source.setData(
            safetyCircle
          );
        }
      };

    if (
      map.isStyleLoaded()
    ) {
      updateCircle();
    } else {
      map.once(
        "load",
        updateCircle
      );
    }

    // Victim-only screen:
    // follow victim.
    // Responder screen:
    // route auto-fit handles viewport.
    if (!responderLocation) {
      map.easeTo({
        center: [
          Number(longitude),
          Number(latitude),
        ],

        zoom: Math.max(
          map.getZoom(),
          17
        ),

        duration: 600,
      });
    }
  }, [
    latitude,
    longitude,
    responderLocation,
  ]);

  // ==================================================
  // RESPONDER'S OWN LOCATION MARKER
  // ==================================================

  useEffect(() => {
    const map =
      mapRef.current;

    if (!map) {
      return;
    }

    if (
      !responderLocation ||
      !isValidCoordinate(
        responderLocation.latitude
      ) ||
      !isValidCoordinate(
        responderLocation.longitude
      )
    ) {
      if (
        responderMarkerRef.current
      ) {
        responderMarkerRef.current.remove();

        responderMarkerRef.current =
          null;
      }

      return;
    }

    const coordinates = [
      Number(
        responderLocation.longitude
      ),

      Number(
        responderLocation.latitude
      ),
    ];

    if (
      responderMarkerRef.current
    ) {
      responderMarkerRef.current.setLngLat(
        coordinates
      );
    } else {
      responderMarkerRef.current =
        new maplibregl.Marker({
          color: "#2563eb",
        })
          .setLngLat(
            coordinates
          )
          .setPopup(
            new maplibregl.Popup({
              offset: 20,
            }).setHTML(`
              <div style="font-family:Arial,sans-serif">
                <strong style="color:#1d4ed8">
                  🏠 YOUR LOCATION
                </strong>
                <br/>
                Verified responder
              </div>
            `)
          )
          .addTo(map);
    }

    fitCoordinates([
      coordinates,
      [
        Number(longitude),
        Number(latitude),
      ],
    ]);
  }, [
    responderLocation,
    latitude,
    longitude,
  ]);

  // ==================================================
  // VICTIM-SIDE NEARBY RESPONDER MARKERS
  // ==================================================

  useEffect(() => {
    const map =
      mapRef.current;

    if (!map) {
      return;
    }

    nearbyMarkersRef.current.forEach(
      (marker) =>
        marker.remove()
    );

    nearbyMarkersRef.current =
      [];

    if (
      !Array.isArray(
        responders
      )
    ) {
      return;
    }

    responders
      .filter(
        (responder) =>
          responder.insideRadius &&
          isValidCoordinate(
            responder.latitude
          ) &&
          isValidCoordinate(
            responder.longitude
          )
      )
      .forEach(
        (responder) => {
          const isSecurity =
            responder.name ===
            "Security Guard";

          const marker =
            new maplibregl.Marker({
              color:
                isSecurity
                  ? "#f59e0b"
                  : "#16a34a",
            })
              .setLngLat([
                Number(
                  responder.longitude
                ),

                Number(
                  responder.latitude
                ),
              ])
              .setPopup(
                new maplibregl.Popup({
                  offset: 20,
                }).setHTML(`
                  <div style="font-family:Arial,sans-serif">
                    <strong>
                      ${
                        isSecurity
                          ? "🛡️"
                          : "🏠"
                      }
                      ${
                        responder.name
                      }
                    </strong>

                    <br/>

                    ${
                      responder.type
                    }

                    <br/>

                    ${
                      responder.distance
                    } metres away
                  </div>
                `)
              )
              .addTo(map);

          nearbyMarkersRef.current.push(
            marker
          );
        }
      );
  }, [
    responders,
  ]);

  // ==================================================
  // AMAZON LOCATION PEDESTRIAN RESCUE ROUTE
  // ==================================================

  useEffect(() => {
    const map =
      mapRef.current;

    if (
      !map ||
      !responderLocation ||
      !apiKey ||
      !isValidCoordinate(
        responderLocation.latitude
      ) ||
      !isValidCoordinate(
        responderLocation.longitude
      ) ||
      !isValidCoordinate(latitude) ||
      !isValidCoordinate(longitude)
    ) {
      clearRoute();

      return;
    }

    const requestId =
      ++routeRequestRef.current;

    setRouteStatus(
      "Calculating pedestrian rescue route..."
    );

    async function updateRoute() {
      try {
        const response =
          await fetch(
            `https://routes.geo.${region}.amazonaws.com/v2/routes?key=${encodeURIComponent(
              apiKey
            )}`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  Origin: [
                    Number(
                      responderLocation.longitude
                    ),

                    Number(
                      responderLocation.latitude
                    ),
                  ],

                  Destination: [
                    Number(
                      longitude
                    ),

                    Number(
                      latitude
                    ),
                  ],

                  TravelMode:
                    "Pedestrian",

                  TravelStepType:
                    "Default",

                  LegGeometryFormat:
                    "Simple",

                  LegAdditionalFeatures: [
                    "Summary",
                  ],
                }),
            }
          );

        if (!response.ok) {
          const errorText =
            await response.text();

          console.error(
            "Amazon Location route request failed:",
            response.status,
            errorText
          );

          if (
            requestId ===
            routeRequestRef.current
          ) {
            setRouteStatus(
              `Route unavailable (${response.status})`
            );

            setRouteInfo(null);
            setRouteSteps([]);
          }

          return;
        }

        const data =
          await response.json();

        console.log(
          "Amazon Location route response:",
          data
        );

        if (
          requestId !==
          routeRequestRef.current
        ) {
          return;
        }

        const route =
          data.Routes?.[0];

        if (!route) {
          setRouteStatus(
            "No pedestrian route was returned."
          );

          clearRoute();

          return;
        }

        const legs =
          Array.isArray(
            route.Legs
          )
            ? route.Legs
            : [];

        // --------------------------------
        // COMBINE ALL ROUTE GEOMETRY
        // --------------------------------

        const coordinates = [];

        legs.forEach(
          (leg) => {
            const legCoordinates =
              leg?.Geometry
                ?.LineString;

            if (
              !Array.isArray(
                legCoordinates
              )
            ) {
              return;
            }

            legCoordinates.forEach(
              (
                coordinate,
                index
              ) => {
                // Avoid duplicate point
                // between consecutive legs.
                if (
                  coordinates.length >
                    0 &&
                  index === 0
                ) {
                  const previous =
                    coordinates[
                      coordinates.length -
                        1
                    ];

                  if (
                    previous?.[0] ===
                      coordinate?.[0] &&
                    previous?.[1] ===
                      coordinate?.[1]
                  ) {
                    return;
                  }
                }

                coordinates.push(
                  coordinate
                );
              }
            );
          }
        );

        if (
          coordinates.length < 2
        ) {
          console.error(
            "No Simple LineString route geometry returned.",
            data
          );

          setRouteStatus(
            "Route calculated, but route geometry was unavailable."
          );

          clearRoute();

          return;
        }

        // --------------------------------
        // ROUTE DISTANCE + TIME
        // --------------------------------

        const routeSummary =
          route?.Summary;

        const firstLegOverview =
          legs?.[0]
            ?.PedestrianLegDetails
            ?.Summary?.Overview;

        let distance =
          routeSummary?.Distance ??
          firstLegOverview?.Distance;

        let duration =
          routeSummary?.Duration ??
          firstLegOverview?.Duration;

        // Fallback: total the
        // pedestrian travel steps.
        if (
          !Number.isFinite(
            Number(distance)
          ) ||
          !Number.isFinite(
            Number(duration)
          )
        ) {
          let calculatedDistance = 0;
          let calculatedDuration = 0;

          legs.forEach(
            (leg) => {
              const steps =
                leg
                  ?.PedestrianLegDetails
                  ?.TravelSteps ||
                [];

              steps.forEach(
                (step) => {
                  calculatedDistance +=
                    Number(
                      step.Distance ||
                        0
                    );

                  calculatedDuration +=
                    Number(
                      step.Duration ||
                        0
                    );
                }
              );
            }
          );

          distance =
            calculatedDistance;

          duration =
            calculatedDuration;
        }

        // --------------------------------
        // HUMAN-READABLE DIRECTIONS
        // --------------------------------

        const directions = [];

        legs.forEach(
          (leg) => {
            const steps =
              leg
                ?.PedestrianLegDetails
                ?.TravelSteps ||
              [];

            steps.forEach(
              (step) => {
                if (
                  step?.Instruction
                ) {
                  directions.push({
                    instruction:
                      step.Instruction,

                    distance:
                      Number(
                        step.Distance ||
                          0
                      ),

                    duration:
                      Number(
                        step.Duration ||
                          0
                      ),
                  });
                }
              }
            );
          }
        );

        // --------------------------------
        // DRAW + AUTO ZOOM
        // --------------------------------

        const drawRoute =
          () => {
            updateRouteLayer(
              coordinates
            );
          };

        if (
          map.isStyleLoaded()
        ) {
          drawRoute();
        } else {
          map.once(
            "load",
            drawRoute
          );
        }

        setRouteInfo({
          distance:
            Number(distance) || 0,

          duration:
            Number(duration) || 0,
        });

        setRouteSteps(
          directions
        );

        setRouteStatus(
          "Pedestrian rescue route ready"
        );
      } catch (error) {
        console.error(
          "Walking route error:",
          error
        );

        if (
          requestId ===
          routeRequestRef.current
        ) {
          setRouteStatus(
            "Unable to calculate rescue route."
          );

          setRouteInfo(null);
          setRouteSteps([]);
        }
      }
    }

    if (
      map.isStyleLoaded()
    ) {
      updateRoute();
    } else {
      map.once(
        "load",
        updateRoute
      );
    }
  }, [
    latitude,
    longitude,
    responderLocation,
    apiKey,
    region,
  ]);

  // ==================================================
  // UI
  // ==================================================

  return (
    <div
      style={{
        width: "100%",
      }}
    >
      <div
        style={{
          position: "relative",
        }}
      >
        <div
          ref={mapContainer}
          style={{
            width: "100%",

            height: "430px",

            borderRadius:
              "16px",

            overflow:
              "hidden",

            background:
              "#0f172a",
          }}
        />

        <div
          style={{
            position:
              "absolute",

            left: "12px",

            top: "12px",

            zIndex: 5,

            padding:
              "8px 11px",

            borderRadius:
              "10px",

            background:
              "rgba(15,23,42,0.88)",

            color: "white",

            fontSize:
              "11px",

            fontWeight: 800,

            boxShadow:
              "0 4px 14px rgba(0,0,0,0.25)",
          }}
        >
          🛰 HYBRID SATELLITE
        </div>

        <div
          style={{
            position:
              "absolute",

            left: "12px",

            bottom: "12px",

            zIndex: 5,

            padding:
              "7px 10px",

            borderRadius:
              "9px",

            background:
              "rgba(255,255,255,0.92)",

            color:
              "#0f172a",

            fontSize:
              "10px",

            fontWeight: 700,

            maxWidth:
              "230px",
          }}
        >
          {mapStatus}
        </div>
      </div>

      {responderLocation && (
        <div
          style={{
            marginTop:
              "12px",

            padding:
              "15px",

            background:
              "#eff6ff",

            border:
              "1px solid #bfdbfe",

            borderRadius:
              "14px",
          }}
        >
          <div
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              gap: "12px",

              alignItems:
                "center",

              flexWrap:
                "wrap",
            }}
          >
            <div>
              <strong
                style={{
                  color:
                    "#1e3a8a",

                  fontSize:
                    "14px",
                }}
              >
                🧭 RESCUE DIRECTIONS
              </strong>

              <div
                style={{
                  marginTop:
                    "4px",

                  color:
                    routeStatus.includes(
                      "ready"
                    )
                      ? "#166534"
                      : "#475569",

                  fontSize:
                    "12px",

                  fontWeight:
                    700,
                }}
              >
                {routeStatus}
              </div>
            </div>

            <button
              type="button"
              onClick={
                recenterRescueRoute
              }
              style={{
                border:
                  "1px solid #93c5fd",

                background:
                  "white",

                color:
                  "#1d4ed8",

                padding:
                  "8px 10px",

                borderRadius:
                  "9px",

                fontSize:
                  "10px",

                fontWeight:
                  800,

                cursor:
                  "pointer",
              }}
            >
              ⛶ SHOW FULL ROUTE
            </button>
          </div>

          {routeInfo && (
            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",

                gap: "10px",

                marginTop:
                  "12px",
              }}
            >
              <div
                style={{
                  background:
                    "white",

                  padding:
                    "12px",

                  borderRadius:
                    "11px",

                  textAlign:
                    "center",
                }}
              >
                <div
                  style={{
                    color:
                      "#64748b",

                    fontSize:
                      "10px",

                    fontWeight:
                      800,
                  }}
                >
                  WALKING DISTANCE
                </div>

                <div
                  style={{
                    marginTop:
                      "4px",

                    color:
                      "#0f172a",

                    fontSize:
                      "20px",

                    fontWeight:
                      900,
                  }}
                >
                  {Math.round(
                    routeInfo.distance
                  )}{" "}
                  m
                </div>
              </div>

              <div
                style={{
                  background:
                    "white",

                  padding:
                    "12px",

                  borderRadius:
                    "11px",

                  textAlign:
                    "center",
                }}
              >
                <div
                  style={{
                    color:
                      "#64748b",

                    fontSize:
                      "10px",

                    fontWeight:
                      800,
                  }}
                >
                  EST. WALKING TIME
                </div>

                <div
                  style={{
                    marginTop:
                      "4px",

                    color:
                      "#0f172a",

                    fontSize:
                      "20px",

                    fontWeight:
                      900,
                  }}
                >
                  ~
                  {Math.max(
                    1,
                    Math.ceil(
                      routeInfo.duration /
                        60
                    )
                  )}{" "}
                  min
                </div>
              </div>
            </div>
          )}

          {routeSteps.length >
            0 && (
            <div
              style={{
                marginTop:
                  "12px",

                background:
                  "white",

                borderRadius:
                  "12px",

                padding:
                  "12px",
              }}
            >
              <div
                style={{
                  fontSize:
                    "11px",

                  fontWeight:
                    900,

                  color:
                    "#0f172a",

                  marginBottom:
                    "8px",
                }}
              >
                WALKING DIRECTIONS
              </div>

              <div
                style={{
                  display:
                    "grid",

                  gap: "7px",
                }}
              >
                {routeSteps
                  .slice(
                    0,
                    8
                  )
                  .map(
                    (
                      step,
                      index
                    ) => (
                      <div
                        key={
                          index
                        }
                        style={{
                          display:
                            "grid",

                          gridTemplateColumns:
                            "24px 1fr auto",

                          gap:
                            "8px",

                          alignItems:
                            "start",

                          fontSize:
                            "11px",

                          color:
                            "#334155",
                        }}
                      >
                        <div
                          style={{
                            width:
                              "22px",

                            height:
                              "22px",

                            borderRadius:
                              "50%",

                            background:
                              "#dbeafe",

                            color:
                              "#1d4ed8",

                            display:
                              "grid",

                            placeItems:
                              "center",

                            fontWeight:
                              900,

                            fontSize:
                              "10px",
                          }}
                        >
                          {index +
                            1}
                        </div>

                        <div>
                          {
                            step.instruction
                          }
                        </div>

                        <div
                          style={{
                            color:
                              "#64748b",

                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {Math.round(
                            step.distance
                          )}{" "}
                          m
                        </div>
                      </div>
                    )
                  )}
              </div>
            </div>
          )}

          <div
            style={{
              marginTop:
                "10px",

              fontSize:
                "10px",

              color:
                "#64748b",

              lineHeight:
                1.5,
            }}
          >
            🔴 Red marker = victim
            &nbsp; • &nbsp;
            🔵 Blue marker = responder
            &nbsp; • &nbsp;
            Blue line = pedestrian rescue route
          </div>
        </div>
      )}
    </div>
  );
}

export default SafetyMap;