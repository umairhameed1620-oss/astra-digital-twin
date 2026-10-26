import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const PLANET_COLORS = {
  satellite: 0x00d4ff,
  rocket: 0xff6432,
  station: 0x9664ff,
  rover: 0xffc832,
};

// ---- Physical constants ----
const MU = 398600.4418;            // Earth gravitational parameter, km^3/s^2
const RE = 6371;                   // Earth radius, km (scene unit = 1 RE)
const DEG = Math.PI / 180;
const EPOCH = Date.UTC(2026, 0, 1); // reference epoch so positions are stable across reloads
const GT_N = 360;                  // ground-track points
const GT_STEP_MS = 30000;          // 30 s between ground-track points (~3 h of history)
const TRAIL_N = 80;                // bright trail points
const TEX = '/textures/';

// ---- Astro helpers ----
const julian = (ms) => ms / 86400000 + 2440587.5;

const gmst = (ms) => {
  const d = julian(ms) - 2451545.0;
  const g = (280.46061837 + 360.98564736629 * d) % 360;
  return ((g + 360) % 360) * DEG;
};

// Low-precision solar position, returned as a unit vector in scene coordinates
const sunDirection = (ms, out = new THREE.Vector3()) => {
  const n = julian(ms) - 2451545.0;
  const L = (280.46 + 0.9856474 * n) * DEG;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const X = Math.cos(lam);
  const Y = Math.cos(eps) * Math.sin(lam);
  const Z = Math.sin(eps) * Math.sin(lam);
  return out.set(X, Z, -Y).normalize();
};

const hash = (s) => {
  let x = 0;
  for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(x);
};

// Circular orbit position in ECI (km)
const eci = (o, ms) => {
  const dt = (ms - o.epoch) / 1000;
  const u = o.u0 + o.n * dt;
  const cu = Math.cos(u), su = Math.sin(u);
  const cO = Math.cos(o.raan), sO = Math.sin(o.raan);
  const ci = Math.cos(o.inc), si = Math.sin(o.inc);
  return {
    X: o.a * (cO * cu - sO * su * ci),
    Y: o.a * (sO * cu + cO * su * ci),
    Z: o.a * (su * si),
  };
};

// ECI (km) -> scene (Earth radii). ECI Z (north) maps to scene +Y.
const toScene = (p, out = new THREE.Vector3()) => out.set(p.X / RE, p.Z / RE, -p.Y / RE);

const geodetic = (p, ms) => {
  const r = Math.hypot(p.X, p.Y, p.Z);
  let lon = Math.atan2(p.Y, p.X) - gmst(ms);
  lon = Math.atan2(Math.sin(lon), Math.cos(lon));
  return { lat: Math.asin(p.Z / r), lon, r };
};

// Lat/lon -> Earth-mesh local coordinates (matches three.js SphereGeometry UV layout)
const writeLatLon = (lat, lon, rad, arr, i) => {
  arr[i * 3] = rad * Math.cos(lat) * Math.cos(lon);
  arr[i * 3 + 1] = rad * Math.sin(lat);
  arr[i * 3 + 2] = -rad * Math.cos(lat) * Math.sin(lon);
};

const getSim = (clockRef, scaleRef) =>
  clockRef.current.sim + (performance.now() - clockRef.current.real) * scaleRef.current;

// ---- Shaders ----
const EARTH_VERT = `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vViewDir = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D specMap;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewDir);
    float ndl = dot(n, sunDir);
    float dayMix = smoothstep(-0.12, 0.18, ndl);
    vec3 dayCol = texture2D(dayMap, vUv).rgb * (0.12 + 1.1 * max(ndl, 0.0));
    vec3 nightCol = texture2D(nightMap, vUv).rgb * vec3(1.0, 0.85, 0.6) * 1.6;
    vec3 col = mix(nightCol, dayCol, dayMix);
    vec3 h = normalize(sunDir + v);
    float spec = pow(max(dot(n, h), 0.0), 35.0) * texture2D(specMap, vUv).r * 0.55 * dayMix;
    col += vec3(1.0, 0.95, 0.85) * spec;
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    col += vec3(0.25, 0.55, 1.0) * rim * 0.45 * dayMix;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const ATM_VERT = `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATM_FRAG = `
  varying vec3 vN;
  void main() {
    float i = pow(0.65 - dot(vN, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * i * 0.8;
  }
`;

const fmtLat = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'E' : 'W'}`;

const panelStyle = {
  position: 'absolute',
  background: 'rgba(2,4,8,0.85)',
  border: '1px solid var(--border)',
  borderRadius: 8,
};

const OrbitalVisualiser = ({ spacecraft = [], telemetry = {}, selectedId, onSelect }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const earthRef = useRef(null);
  const marsRef = useRef(null);
  const frameRef = useRef(null);
  const objectsRef = useRef({});
  const pickablesRef = useRef([]);
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const previousMouse = useRef({ x: 0, y: 0 });
  const cameraAngle = useRef({ theta: 0.6, phi: Math.PI / 2.6, radius: 3.2 });
  const clockRef = useRef({ sim: Date.now(), real: performance.now() });
  const scaleRef = useRef(60);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);

  const [timeScale, setTimeScale] = useState(60);
  const [readout, setReadout] = useState(null);
  const [localSel, setLocalSel] = useState(null);

  useEffect(() => { selectedRef.current = selectedId ?? localSel; }, [selectedId, localSel]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  const changeScale = (s) => {
    const now = performance.now();
    clockRef.current = {
      sim: clockRef.current.sim + (now - clockRef.current.real) * scaleRef.current,
      real: now,
    };
    scaleRef.current = s;
    setTimeScale(s);
  };

  const goLive = () => {
    clockRef.current = { sim: Date.now(), real: performance.now() };
    scaleRef.current = 1;
    setTimeScale(1);
  };

  // ---------- Scene setup ----------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020408);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.01, 1000);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Stars
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 8000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(200 + Math.random() * 200);
      starPositions[i * 3] = v.x;
      starPositions[i * 3 + 1] = v.y;
      starPositions[i * 3 + 2] = v.z;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.8 })
    ));

    // Earth
    const loader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const loadTex = (f) => {
      const t = loader.load(TEX + f);
      t.anisotropy = maxAniso;
      return t;
    };
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: loadTex('earth_atmos_2048.jpg') },
        nightMap: { value: loadTex('earth_lights_2048.png') },
        specMap: { value: loadTex('earth_specular_2048.jpg') },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), earthMat);
    earth.name = 'earth';
    scene.add(earth);
    earthRef.current = earth;

    // Clouds (child of Earth so they rotate with it, plus slow drift)
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.008, 64, 64),
      new THREE.MeshPhongMaterial({
        map: loadTex('earth_clouds_1024.png'),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    earth.add(clouds);

    // Atmosphere
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: ATM_VERT,
        fragmentShader: ATM_FRAG,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      })
    ));

    // Lighting (positioned from the real Sun each frame)
    const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.6);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x223344, 0.25));

    // Sun glow sprite
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createGlowTexture(),
      color: 0xfff1c0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    sun.scale.set(8, 8, 1);
    scene.add(sun);

    // Mars (only shown when a rover exists)
    const marsGroup = new THREE.Group();
    const mars = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 32, 32),
      new THREE.MeshPhongMaterial({ color: 0x8b3a0f, emissive: 0x3a1505 })
    );
    marsGroup.add(mars);
    const marsLabel = createLabel('MARS', 0xffc832, 0.5);
    marsLabel.position.set(0, 1.2, 0);
    marsGroup.add(marsLabel);
    marsGroup.position.set(5, 0, 0);
    marsGroup.visible = false;
    scene.add(marsGroup);
    marsRef.current = marsGroup;

    // Mouse controls + click-to-select
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const onMouseDown = (e) => {
      isDragging.current = true;
      dragMoved.current = false;
      previousMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e) => {
      if (!isDragging.current) return;
      const dx = e.clientX - previousMouse.current.x;
      const dy = e.clientY - previousMouse.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved.current = true;
      cameraAngle.current.theta -= dx * 0.008;
      cameraAngle.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraAngle.current.phi - dy * 0.008));
      previousMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = (e) => {
      const wasClick = isDragging.current && !dragMoved.current;
      isDragging.current = false;
      if (!wasClick || !mount.contains(e.target)) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(pickablesRef.current, true);
      if (!hits.length) return;
      let o = hits[0].object;
      while (o && o.userData.scId === undefined) o = o.parent;
      if (!o) return;
      setLocalSel(o.userData.scId);
      if (onSelectRef.current) onSelectRef.current(o.userData.scId);
    };
    const onWheel = (e) => {
      e.preventDefault();
      cameraAngle.current.radius = Math.max(1.25, Math.min(15, cameraAngle.current.radius + e.deltaY * 0.004));
    };

    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    mount.addEventListener('wheel', onWheel, { passive: false });

    // Animation
    const sunDir = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    let lastReadout = 0;

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const ms = getSim(clockRef, scaleRef);
      const tReal = performance.now();

      // Real Sun + Earth orientation
      sunDirection(ms, sunDir);
      earthMat.uniforms.sunDir.value.copy(sunDir);
      sunLight.position.copy(sunDir).multiplyScalar(50);
      sun.position.copy(sunDir).multiplyScalar(80);
      earth.rotation.y = gmst(ms);
      clouds.rotation.y = ((ms / 86400000) * 0.5) % (Math.PI * 2);

      // Camera
      const { theta, phi, radius } = cameraAngle.current;
      camera.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(0, 0, 0);

      let focus = null;

      Object.entries(objectsRef.current).forEach(([id, obj]) => {
        const isSel = String(id) === String(selectedRef.current);
        const pulse = 1 + 0.25 * Math.sin(tReal * 0.004 + obj.phase);
        obj.glow.scale.setScalar((isSel ? 2.2 : 1) * pulse);

        if (obj.orbit) {
          const p = eci(obj.orbit, ms);
          toScene(p, obj.mesh.position);
          obj.mesh.lookAt(0, 0, 0);

          // Bright trail: last 15% of an orbit
          const tp = obj.trail.geometry.attributes.position;
          const span = obj.orbit.period * 1000 * 0.15;
          for (let k = 0; k < TRAIL_N; k++) {
            const pk = eci(obj.orbit, ms - span * (1 - k / (TRAIL_N - 1)));
            tp.setXYZ(k, pk.X / RE, pk.Z / RE, -pk.Y / RE);
          }
          tp.needsUpdate = true;

          // Ground track (refresh every few frames)
          obj.gtTick = (obj.gtTick || 0) + 1;
          if (obj.gtTick % 6 === 0) updateGroundTrack(obj, ms);

          if (isSel) focus = { obj, p };
          else if (!focus) focus = { obj, p };
        }

        if (obj.type === 'rover') {
          obj.mesh.position.set(5, 0.8, 0);
        }

        if (obj.type === 'rocket') {
          obj.altitude = (obj.altitude || 0) + 0.001;
          if (obj.altitude > 2) obj.altitude = 0;
          obj.mesh.position.set(0, 1 + obj.altitude, 0);
          if (obj.exhaust) obj.exhaust.scale.setScalar(0.5 + Math.random() * 0.5);
        }

        // Label sits just outside the craft, radially
        tmp.copy(obj.mesh.position);
        const len = tmp.length() || 1;
        obj.label.position.copy(tmp).multiplyScalar(1 + 0.06 / len);
        obj.label.material.opacity = isSel ? 1 : 0.75;
      });

      // Telemetry readout (4 Hz)
      if (tReal - lastReadout > 250) {
        lastReadout = tReal;
        const utc = new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
        if (focus) {
          const { obj, p } = focus;
          const g = geodetic(p, ms);
          toScene(p, tmp);
          const d = tmp.dot(sunDir);
          tmp2.copy(tmp).addScaledVector(sunDir, -d);
          const eclipse = d < 0 && tmp2.length() < 1;
          setReadout({
            name: obj.name,
            lat: g.lat / DEG,
            lon: g.lon / DEG,
            alt: g.r - RE,
            vel: Math.sqrt(MU / obj.orbit.a),
            period: obj.orbit.period / 60,
            inc: obj.orbit.inc / DEG,
            eclipse,
            utc,
          });
        } else {
          setReadout({ name: null, utc });
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      mount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      mount.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // ---------- Build spacecraft when the list changes ----------
  useEffect(() => {
    const scene = sceneRef.current;
    const earth = earthRef.current;
    if (!scene || !earth) return;

    // Remove old objects
    Object.values(objectsRef.current).forEach((obj) => {
      [obj.mesh, obj.orbitLine, obj.trail, obj.label].forEach((o) => {
        if (!o) return;
        scene.remove(o);
        disposeTree(o);
      });
      if (obj.track) {
        earth.remove(obj.track);
        disposeTree(obj.track);
      }
    });
    objectsRef.current = {};
    pickablesRef.current = [];

    if (marsRef.current) marsRef.current.visible = spacecraft.some((s) => s.type === 'rover');

    const nowMs = getSim(clockRef, scaleRef);

    spacecraft.forEach((sc, idx) => {
      const color = PLANET_COLORS[sc.type] || 0x00d4ff;
      const cfg = sc.config || {};
      const name = sc.name || cfg.name || `CRAFT-${idx + 1}`;

      // Model
      const group = new THREE.Group();
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
      if (sc.type === 'rocket') {
        group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.08, 8), mat));
      } else if (sc.type === 'station') {
        group.add(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 16), mat));
      } else if (sc.type === 'rover') {
        group.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.06), mat));
      } else {
        group.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.014), mat));
        const panelMat = new THREE.MeshPhongMaterial({
          color: 0x1b3a8a, emissive: 0x0a1a44, specular: 0x88aaff, shininess: 80, side: THREE.DoubleSide,
        });
        [-1, 1].forEach((s) => {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.0012, 0.01), panelMat);
          panel.position.x = s * 0.02;
          group.add(panel);
        });
      }

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false })
      );
      group.add(glow);
      group.userData.scId = sc.id;
      scene.add(group);

      const label = createLabel(name, color, 0.32);
      label.userData.scId = sc.id;
      scene.add(label);

      // Rocket exhaust
      let exhaust = null;
      if (sc.type === 'rocket') {
        exhaust = new THREE.Mesh(
          new THREE.ConeGeometry(0.015, 0.04, 8),
          new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8 })
        );
        exhaust.position.y = -0.06;
        group.add(exhaust);
      }

      // Orbit (satellites, stations, and anything not a rocket/rover)
      let orbit = null;
      let orbitLine = null;
      let trail = null;
      let track = null;

      if (sc.type !== 'rocket' && sc.type !== 'rover') {
        const altKm = Number(cfg.altitude) || 550;
        const a = RE + altKm;
        const n = Math.sqrt(MU / (a * a * a));
        orbit = {
          a,
          n,
          period: (2 * Math.PI) / n,
          inc: Number(cfg.inclination ?? 53) * DEG,
          raan: (cfg.raan != null ? Number(cfg.raan) : hash(sc.id) % 360) * DEG,
          u0: (cfg.trueAnomaly != null ? Number(cfg.trueAnomaly) : hash(`${sc.id}u`) % 360) * DEG,
          epoch: EPOCH,
        };

        // Full orbit ring (inertial frame)
        const ringPts = [];
        for (let k = 0; k <= 256; k++) {
          ringPts.push(toScene(eci(orbit, nowMs + (k / 256) * orbit.period * 1000)));
        }
        orbitLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(ringPts),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22 })
        );
        scene.add(orbitLine);

        // Bright trail
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
        trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        scene.add(trail);

        // Ground track (Earth-fixed, so it is a child of the Earth mesh)
        const trackGeo = new THREE.BufferGeometry();
        trackGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GT_N * 3), 3));
        track = new THREE.Line(trackGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
        earth.add(track);
      }

      const obj = {
        mesh: group, glow, label, orbitLine, trail, track, exhaust,
        type: sc.type, orbit, name, phase: idx * 1.7, altitude: 0,
      };
      if (orbit) updateGroundTrack(obj, nowMs);

      objectsRef.current[sc.id] = obj;
      pickablesRef.current.push(group, label);
    });
  }, [spacecraft]);

  const rows = readout && readout.name ? [
    ['LAT', fmtLat(readout.lat)],
    ['LON', fmtLon(readout.lon)],
    ['ALTITUDE', `${readout.alt.toFixed(1)} km`],
    ['VELOCITY', `${readout.vel.toFixed(3)} km/s`],
    ['PERIOD', `${readout.period.toFixed(1)} min`],
    ['INCLINATION', `${readout.inc.toFixed(1)}°`],
    ['LIGHTING', readout.eclipse ? 'ECLIPSE' : 'SUNLIT'],
  ] : [];

  const btn = (active) => ({
    background: active ? '#00d4ff' : 'transparent',
    color: active ? '#020408' : 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Live telemetry */}
      {rows.length > 0 && (
        <div style={{ ...panelStyle, top: 16, left: 16, padding: '12px 14px', fontSize: 11, fontFamily: 'monospace', minWidth: 220 }}>
          <div style={{ color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Live Telemetry</div>
          <div style={{ color: '#00d4ff', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{readout.name}</div>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ color: k === 'LIGHTING' && readout.eclipse ? '#ffc832' : 'var(--text-secondary)' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Fleet legend */}
      <div style={{ ...panelStyle, bottom: 16, left: 16, padding: '10px 14px', fontSize: 11 }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>Fleet</div>
        {[['satellite', '🛰️', '#00d4ff'], ['rocket', '🚀', '#ff6432'], ['station', '🔭', '#9664ff'], ['rover', '🤖', '#ffc832']].map(([type, icon, color]) => {
          const count = spacecraft.filter((s) => s.type === type).length;
          if (!count) return null;
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--text-secondary)' }}>{icon} {count} {type}{count > 1 ? 's' : ''}</span>
            </div>
          );
        })}
      </div>

      {/* Controls hint */}
      <div style={{ ...panelStyle, top: 16, right: 16, padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)' }}>
        <div>🖱️ Drag to rotate</div>
        <div>🖱️ Scroll to zoom</div>
        <div>👆 Click a craft to select</div>
      </div>

      {/* Sim clock + time controls */}
      <div style={{ ...panelStyle, bottom: 16, right: 16, padding: '10px 12px', fontSize: 10, fontFamily: 'monospace' }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
          SIM UTC {readout ? readout.utc : '—'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 60, 600].map((s) => (
            <button key={s} onClick={() => changeScale(s)} style={btn(timeScale === s)}>{s}×</button>
          ))}
          <button onClick={goLive} style={btn(false)}>LIVE</button>
        </div>
      </div>
    </div>
  );
};

// ---------- Helpers ----------
function updateGroundTrack(obj, ms) {
  const arr = obj.track.geometry.attributes.position.array;
  for (let k = 0; k < GT_N; k++) {
    const t = ms - (GT_N - 1 - k) * GT_STEP_MS;
    const g = geodetic(eci(obj.orbit, t), t);
    writeLatLon(g.lat, g.lon, 1.012, arr, k);
  }
  obj.track.geometry.attributes.position.needsUpdate = true;
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}

function createLabel(text, color, scale = 0.5) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.fillText(text, 256, 78);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(scale, scale / 4, 1);
  return sprite;
}

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.15, 'rgba(255,240,200,0.9)');
  g.addColorStop(0.4, 'rgba(255,200,120,0.25)');
  g.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export default OrbitalVisualiser;
