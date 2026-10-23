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
  const mapContainer =
    useRef(null);

  const mapRef =
    useRef(null);

  const victimMarkerRef =
    useRef(null);

  const responderMarkerRef =
    useRef(null);

  const nearbyMarkersRef =
    useRef([]);

  const routeRequestRef =
    useRef(0);

  const [
    routeInfo,
    setRouteInfo,
  ] = useState(null);

  const apiKey =
    import.meta.env
      .VITE_AWS_LOCATION_API_KEY;

  const region =
    import.meta.env
      .VITE_AWS_REGION ||
    "ap-south-1";

  // --------------------------------
  // CREATE MAP ONLY ONCE
  // --------------------------------

  useEffect(() => {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    if (!apiKey) {
      console.error(
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

    const styleUrl =
      `https://maps.geo.${region}.amazonaws.com/v2/styles/Standard/descriptor?key=${apiKey}&color-scheme=Light&poi-density=VeryDense`;

    const map =
      new maplibregl.Map({
        container:
          mapContainer.current,

        style: styleUrl,

        center: [
          longitude,
          latitude,
        ],

        zoom: 15.5,
      });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl(),
      "top-right"
    );

    // Victim marker
    victimMarkerRef.current =
      new maplibregl.Marker()
        .setLngLat([
          longitude,
          latitude,
        ])
        .setPopup(
          new maplibregl.Popup().setHTML(
            "<strong>🚨 Victim</strong><br/>Live emergency location"
          )
        )
        .addTo(map);

    map.on("load", () => {
      const safetyCircle =
        turf.circle(
          [
            longitude,
            latitude,
          ],
          0.25,
          {
            steps: 80,
            units:
              "kilometers",
          }
        );

      // 250m circle
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
            0.14,
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
            "#dc2626",

          "line-width": 3,
        },
      });

      // Empty route source
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

      // Route line
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
        },
      });
    });

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

    // Map intentionally created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------
  // MOVE VICTIM WITHOUT RELOADING MAP
  // --------------------------------

  useEffect(() => {
    const map =
      mapRef.current;

    if (
      !map ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    if (
      victimMarkerRef.current
    ) {
      victimMarkerRef.current.setLngLat(
        [
          longitude,
          latitude,
        ]
      );
    }

    const safetyCircle =
      turf.circle(
        [
          longitude,
          latitude,
        ],
        0.25,
        {
          steps: 80,
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

    // Smoothly follow victim instead
    // of recreating the whole map.
    map.easeTo({
      center: [
        longitude,
        latitude,
      ],

      duration: 500,
    });
  }, [
    latitude,
    longitude,
  ]);

  // --------------------------------
  // RESPONDER'S OWN MARKER
  // --------------------------------

  useEffect(() => {
    const map =
      mapRef.current;

    if (!map) {
      return;
    }

    if (
      !responderLocation
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
      responderLocation.longitude,
      responderLocation.latitude,
    ];

    if (
      responderMarkerRef.current
    ) {
      responderMarkerRef.current.setLngLat(
        coordinates
      );

      return;
    }

    responderMarkerRef.current =
      new maplibregl.Marker({
        color: "#2563eb",
      })
        .setLngLat(
          coordinates
        )
        .setPopup(
          new maplibregl.Popup().setHTML(
            "<strong>📍 Your Location</strong><br/>Verified responder"
          )
        )
        .addTo(map);
  }, [
    responderLocation,
  ]);

  // --------------------------------
  // VICTIM-SIDE RESPONDER MARKERS
  // --------------------------------

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
          responder.insideRadius
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
                responder.longitude,
                responder.latitude,
              ])
              .setPopup(
                new maplibregl.Popup().setHTML(
                  `<strong>${
                    isSecurity
                      ? "🛡️"
                      : "🏠"
                  } ${
                    responder.name
                  }</strong><br/>
                   ${
                     responder.type
                   }<br/>
                   ${
                     responder.distance
                   } metres away`
                )
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

  // --------------------------------
  // AMAZON LOCATION WALKING ROUTE
  // --------------------------------

  useEffect(() => {
    const map =
      mapRef.current;

    if (
      !map ||
      !responderLocation ||
      !apiKey
    ) {
      setRouteInfo(null);

      return;
    }

    const requestId =
      ++routeRequestRef.current;

    async function updateRoute() {
      try {
        const response =
          await fetch(
            `https://routes.geo.${region}.amazonaws.com/v2/routes?key=${apiKey}`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  Origin: [
                    responderLocation.longitude,
                    responderLocation.latitude,
                  ],

                  Destination: [
                    longitude,
                    latitude,
                  ],

                  TravelMode:
                    "Pedestrian",

                  LegGeometryFormat:
                    "Simple",

                  LegAdditionalFeatures: [
                    "Summary",
                  ],
                }),
            }
          );

        if (
          !response.ok
        ) {
          const errorText =
            await response.text();

          console.error(
            "Route request failed:",
            errorText
          );

          return;
        }

        const data =
          await response.json();

        // Ignore an older route request
        // if a newer GPS update arrived.
        if (
          requestId !==
          routeRequestRef.current
        ) {
          return;
        }

        const route =
          data.Routes?.[0];

        const leg =
          route?.Legs?.[0];

        const coordinates =
          leg?.Geometry
            ?.LineString;

        if (
          !coordinates ||
          coordinates.length <
            2
        ) {
          console.log(
            "No walking route geometry returned."
          );

          return;
        }

        const routeGeoJson =
          {
            type:
              "Feature",

            geometry: {
              type:
                "LineString",

              coordinates,
            },

            properties: {},
          };

        const updateRouteSource =
          () => {
            const source =
              map.getSource(
                "walking-route"
              );

            if (source) {
              source.setData(
                routeGeoJson
              );
            }
          };

        if (
          map.isStyleLoaded()
        ) {
          updateRouteSource();
        } else {
          map.once(
            "load",
            updateRouteSource
          );
        }

        const summary =
          leg
            ?.PedestrianLegDetails
            ?.Summary
            ?.Overview ||
          leg?.Summary
            ?.Overview;

        if (summary) {
          setRouteInfo({
            distance:
              summary.Distance,

            duration:
              summary.Duration,
          });
        }
      } catch (error) {
        console.error(
          "Walking route error:",
          error
        );
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

  // --------------------------------
  // UI
  // --------------------------------

  return (
    <div>
      <div
        ref={mapContainer}
        style={{
          width: "100%",
          height: "400px",
          borderRadius:
            "16px",
          overflow:
            "hidden",
        }}
      />

      {routeInfo && (
        <div
          style={{
            marginTop:
              "12px",

            padding:
              "14px",

            background:
              "white",

            borderRadius:
              "12px",

            textAlign:
              "center",

            boxShadow:
              "0 3px 12px rgba(0,0,0,0.1)",
          }}
        >
          <strong>
            🚶 WALKING ROUTE
          </strong>

          <div
            style={{
              marginTop:
                "6px",

              fontSize:
                "18px",

              fontWeight:
                "bold",
            }}
          >
            {Math.round(
              routeInfo.distance
            )}{" "}
            m
            {" • "}
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

          <div
            style={{
              marginTop:
                "5px",

              fontSize:
                "13px",

              opacity:
                0.7,
            }}
          >
            Live walking
            route to victim
          </div>
        </div>
      )}
    </div>
  );
}

export default SafetyMap;