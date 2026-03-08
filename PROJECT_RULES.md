# Taiwan Travel Map – Project Rules

This repository builds an interactive Leaflet travel map for a Taiwan itinerary.

## Data Source Rules

The dataset file is the single source of truth:

taiwan_travel_dataset.json

Do not generate new coordinates or locations.

---

## POI Rules

ATM locations must use:

amenity=atm

EasyCard reload stations must use convenience stores:

shop=convenience

Filter names for:

7-Eleven  
FamilyMart  
Hi-Life  
OK Mart

Search radius: 2000 meters around itinerary nodes.

---

## Language Rules

Always prioritize English labels.

Priority order:

name:en  
name

If name:en exists it must be used.

---

## Map Style Rules

Transport colors:

MRT = blue  
Train = green  
Bus = orange  
Walking = yellow  
Airport MRT = purple

---

## Performance Rules

POIs load only when:

zoom >= 13

Markers must use clustering.

---

## Editing Rules

Claude must:

• modify only necessary functions  
• avoid regenerating full files  
• keep dataset untouched