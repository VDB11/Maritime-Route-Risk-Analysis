import numpy as np
from math import radians, sin, cos, sqrt
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class Vessel:
    mmsi: str
    name: str
    lat: float
    lon: float
    speed_kmh: float
    bearing_deg: float
    length_meters: Optional[float] = None
    width_meters: Optional[float] = None

@dataclass
class CollisionRisk:
    vessel_a: Vessel
    vessel_b: Vessel
    cpa_km: float
    tcpa_minutes: float
    risk_level: str

class CollisionDetector:
    def __init__(self):
        self.cpa_warning_km = 1.852
        self.cpa_critical_km = 0.926
        self.tcpa_warning_min = 30
        self.tcpa_critical_min = 15
        self.R = 6371000.0

    def calculate_cpa_tcpa(self, vessel_a: Vessel, vessel_b: Vessel) -> Tuple[float, float]:
        lat0 = (vessel_a.lat + vessel_b.lat) / 2.0
        lon0 = (vessel_a.lon + vessel_b.lon) / 2.0
        R = 6371000.0

        lat1, lon1 = radians(vessel_a.lat), radians(vessel_a.lon)
        lat2, lon2 = radians(vessel_b.lat), radians(vessel_b.lon)
        lat0r, lon0r = radians(lat0), radians(lon0)

        ax = R * (lon1 - lon0r) * cos(lat0r)
        ay = R * (lat1 - lat0r)
        bx = R * (lon2 - lon0r) * cos(lat0r)
        by = R * (lat2 - lat0r)

        speed_a_ms = vessel_a.speed_kmh * 1000 / 3600
        speed_b_ms = vessel_b.speed_kmh * 1000 / 3600
        course_a_rad = radians(vessel_a.bearing_deg)
        course_b_rad = radians(vessel_b.bearing_deg)

        vax = speed_a_ms * sin(course_a_rad)
        vay = speed_a_ms * cos(course_a_rad)
        vbx = speed_b_ms * sin(course_b_rad)
        vby = speed_b_ms * cos(course_b_rad)

        rx = bx - ax
        ry = by - ay
        vx = vbx - vax
        vy = vby - vay

        v_mag_sq = vx*vx + vy*vy
        if v_mag_sq < 1e-9:
            tcpa_s = 0.0
        else:
            tcpa_s = -(rx*vx + ry*vy) / v_mag_sq
            tcpa_s = max(tcpa_s, 0.0)

        cpa_x = rx + vx * tcpa_s
        cpa_y = ry + vy * tcpa_s
        cpa_distance_km = sqrt(cpa_x*cpa_x + cpa_y*cpa_y) / 1000
        tcpa_minutes = tcpa_s / 60

        return cpa_distance_km, tcpa_minutes

    def determine_risk_level(self, cpa_km: float, tcpa_minutes: float) -> str:
        if cpa_km <= self.cpa_critical_km and tcpa_minutes <= self.tcpa_critical_min:
            return "CRITICAL"
        else:
            return "LOW"

    def detect_collisions(self, vessels: List[Vessel]) -> List[CollisionRisk]:
        n = len(vessels)
        if n < 2:
            return []

        east = np.zeros(n)
        north = np.zeros(n)
        lat0 = np.mean([v.lat for v in vessels])
        lon0 = np.mean([v.lon for v in vessels])
        lat0r = radians(lat0)

        for i, v in enumerate(vessels):
            latr = radians(v.lat)
            lonr = radians(v.lon)
            east[i] = self.R * (lonr - radians(lon0)) * cos(lat0r)
            north[i] = self.R * (latr - radians(lat0))

        vx = np.zeros(n)
        vy = np.zeros(n)
        for i, v in enumerate(vessels):
            speed = v.speed_kmh * 1000 / 3600
            brg = radians(v.bearing_deg)
            vx[i] = speed * sin(brg)
            vy[i] = speed * cos(brg)

        idx_i, idx_j = np.triu_indices(n, 1)
        rx = east[idx_j] - east[idx_i]
        ry = north[idx_j] - north[idx_i]
        dvx = vx[idx_j] - vx[idx_i]
        dvy = vy[idx_j] - vy[idx_i]

        v2 = dvx**2 + dvy**2
        dot = rx*dvx + ry*dvy

        tcpa = -dot / np.where(v2 < 1e-9, 1e-9, v2)
        tcpa = np.maximum(tcpa, 0)

        cpa_x = rx + dvx * tcpa
        cpa_y = ry + dvy * tcpa
        cpa_km = np.sqrt(cpa_x**2 + cpa_y**2) / 1000
        tcpa_min = tcpa / 60

        collisions = []
        for k in range(len(idx_i)):
            i, j = idx_i[k], idx_j[k]
            cpa = cpa_km[k]
            tcpa_m = tcpa_min[k]
            risk = self.determine_risk_level(cpa, tcpa_m)
            if risk == "CRITICAL":
                collisions.append(CollisionRisk(vessels[i], vessels[j], float(cpa), float(tcpa_m), risk))
        return collisions

    def get_collisions_in_disaster_area(self, ships_data: Dict, disaster_gdacs_id: str) -> List[CollisionRisk]:
        vessels = []
        if disaster_gdacs_id in ships_data:
            disaster_ships = ships_data[disaster_gdacs_id].get('ships', [])
            for ship in disaster_ships:
                if (ship.get('point') and 
                    ship['point'].get('latitude') is not None and 
                    ship['point'].get('longitude') is not None and
                    ship.get('speedKmh') is not None and
                    ship.get('bearingDeg') is not None):
                    vessels.append(Vessel(
                        mmsi=ship.get('mmsi', 'Unknown'),
                        name=ship.get('boatName', 'Unknown'),
                        lat=ship['point']['latitude'],
                        lon=ship['point']['longitude'],
                        speed_kmh=ship.get('speedKmh', 0),
                        bearing_deg=ship.get('bearingDeg', 0),
                        length_meters=ship.get('lengthMeters'),
                        width_meters=ship.get('widthMeters')
                    ))
        return self.detect_collisions(vessels)

collision_detector = CollisionDetector()
