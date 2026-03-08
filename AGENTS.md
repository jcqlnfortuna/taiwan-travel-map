# Taiwan Travel Map Builder – Claude Skills

Claude should operate using the following skill modules.

## Skill 1 — itinerary_map_architect

Responsible for:
- Leaflet architecture
- marker layers
- route layers
- dataset integration

Rules:
- Use Leaflet.js
- Use OpenStreetMap tiles
- Do not hallucinate coordinates

---

## Skill 2 — transport_fare_engine

Responsible for:
- computing fare conversion
- generating route fare popups

Conversion rule:
1 TWD = 1.845 PHP

---

## Skill 3 — mobile_map_ui

Responsible for:
- route styling
- color coding
- legend panel
- interaction behaviors

Transport color coding:

Blue = MRT  
Green = Train  
Orange = Bus  
Red = Walking

---

## Skill 4 - route_geometry_engine

Responsible for:
- retrieving route geometry from OSRM
- decoding polyline routes
- rendering curved routes on Leaflet

---

## Skill 5 - poi_service_locator

Responsible for:
- retrieving ATM locations
- retrieving convenience stores
- adding service markets
- updating legend pnael

---

## Skill 6 - gps_navigation_engine

Responsible for:
- live location
- nearest route detection
- walking directions

---

## Skill 7 — map_language_localizer

Responsible for:
- prioritizing English place names
- using name:en tags from OpenStreetMap
- translating map labels to English where possible
- ensuring itinerary nodes display name_en fields

---

## Skill 8 — map_navigation_engine

Responsible for:
• map rotation support
• gesture navigation improvements
• smooth mobile interaction
• rotation plugin integration

---

## General Rules

- Use the dataset file as the single source of truth
- Avoid regenerating full files
- Only update modules requested
- Optimize for mobile