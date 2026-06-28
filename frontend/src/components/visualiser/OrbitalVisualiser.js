import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const PLANET_COLORS = {
  satellite: 0x00d4ff,
  rocket: 0xff6432,
  station: 0x9664ff,
  rover: 0xffc832,
};

const OrbitalVisualiser = ({ spacecraft = [], telemetry = {}, selectedId, onSelect }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(null);
  const objectsRef = useRef({});
  const isDragging = useRef(false);
  const previousMouse = useRef({ x: 0, y: 0 });
  const cameraAngle = useRef({ theta: 0, phi: Math.PI / 4, radius: 4 });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020408);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.01, 1000);
    camera.position.set(0, 2, 4);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Stars background
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 8000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      starPositions[i] = (Math.random() - 0.5) * 500;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, sizeAttenuation: true });
    scene.add(new THREE.Points(starGeometry, starMaterial));

    // Earth
    const earthGeometry = new THREE.SphereGeometry(1, 64, 64);
    const earthMaterial = new THREE.MeshPhongMaterial({
      color: 0x1a6b9a,
      emissive: 0x0a2a4a,
      specular: 0x4488cc,
      shininess: 30,
    });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earth.name = 'earth';
    scene.add(earth);

    // Cloud layer
    const cloudGeo = new THREE.SphereGeometry(1.008, 32, 32);
    const cloudMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    clouds.name = 'clouds';
    scene.add(clouds);

    // Atmosphere glow
    const atmGeo = new THREE.SphereGeometry(1.05, 32, 32);
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(atmGeo, atmMat));

    // Grid lines on Earth (latitude/longitude)
    const gridHelper = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.SphereGeometry(1.002, 18, 9)),
      new THREE.LineBasicMaterial({ color: 0x1a3a5c, transparent: true, opacity: 0.4 })
    );
    scene.add(gridHelper);

    // Lighting
    const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
    sunLight.position.set(10, 5, 5);
    sunLight.castShadow = true;
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x112244, 0.8));

    // Sun
    const sunGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff5aa });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(10, 5, 5);
    scene.add(sun);
    const sunGlow = new THREE.PointLight(0xfff5aa, 0.5, 20);
    sunGlow.position.copy(sun.position);
    scene.add(sunGlow);

    // Mars surface (for rovers)
    const marsGeometry = new THREE.SphereGeometry(0.8, 32, 32);
    const marsMaterial = new THREE.MeshPhongMaterial({ color: 0x8b3a0f, emissive: 0x3a1505 });
    const mars = new THREE.Mesh(marsGeometry, marsMaterial);
    mars.position.set(5, 0, 0);
    mars.name = 'mars';
    scene.add(mars);
    const marsLabel = createLabel('MARS', 0.8, 0xffc832);
    marsLabel.position.set(5, 1.2, 0);
    scene.add(marsLabel);

    // Mouse controls
    const onMouseDown = (e) => {
      isDragging.current = true;
      previousMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e) => {
      if (!isDragging.current) return;
      const dx = e.clientX - previousMouse.current.x;
      const dy = e.clientY - previousMouse.current.y;
      cameraAngle.current.theta -= dx * 0.01;
      cameraAngle.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraAngle.current.phi + dy * 0.01));
      previousMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging.current = false; };
    const onWheel = (e) => {
      cameraAngle.current.radius = Math.max(1.5, Math.min(15, cameraAngle.current.radius + e.deltaY * 0.005));
    };

    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    mount.addEventListener('wheel', onWheel);

    // Animation
    let tick = 0;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      tick += 0.005;

      // Rotate Earth
      earth.rotation.y += 0.001;
      clouds.rotation.y += 0.0012;

      // Camera orbit
      const { theta, phi, radius } = cameraAngle.current;
      camera.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(0, 0, 0);

      // Update spacecraft objects
      Object.entries(objectsRef.current).forEach(([id, obj]) => {
        if (obj.orbitAngle !== undefined) {
          obj.orbitAngle += obj.orbitSpeed || 0.003;
          const r = obj.orbitRadius || 1.4;
          const inc = (obj.inclination || 53) * Math.PI / 180;
          obj.mesh.position.set(
            r * Math.cos(obj.orbitAngle),
            r * Math.sin(obj.orbitAngle) * Math.sin(inc),
            r * Math.sin(obj.orbitAngle) * Math.cos(inc)
          );
          // Pulsing glow
          if (obj.glow) {
            obj.glow.scale.setScalar(1 + 0.2 * Math.sin(tick * 3 + obj.orbitAngle));
          }
          // Update orbit trail
          if (obj.trail) {
            const positions = obj.trail.geometry.attributes.position;
            for (let i = 0; i < positions.count - 1; i++) {
              positions.setXYZ(i, positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
            }
            positions.setXYZ(positions.count - 1, obj.mesh.position.x, obj.mesh.position.y, obj.mesh.position.z);
            positions.needsUpdate = true;
          }
        }
        // Rover on Mars surface
        if (obj.type === 'rover') {
          obj.mesh.position.set(5, 0.8, 0);
          if (obj.glow) obj.glow.scale.setScalar(1 + 0.3 * Math.sin(tick * 2));
        }
        // Rocket ascent
        if (obj.type === 'rocket') {
          obj.altitude = (obj.altitude || 0) + 0.001;
          if (obj.altitude > 2) obj.altitude = 0;
          obj.mesh.position.set(0, 1 + obj.altitude, 0);
          if (obj.exhaust) obj.exhaust.scale.setScalar(0.5 + Math.random() * 0.5);
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const onResize = () => {
      if (!mount) return;
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

  // Add/update spacecraft objects when list changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old objects
    Object.values(objectsRef.current).forEach(obj => {
      if (obj.mesh) scene.remove(obj.mesh);
      if (obj.orbitLine) scene.remove(obj.orbitLine);
      if (obj.trail) scene.remove(obj.trail);
      if (obj.glow) scene.remove(obj.glow);
      if (obj.exhaust) scene.remove(obj.exhaust);
    });
    objectsRef.current = {};

    spacecraft.forEach((sc, idx) => {
      const color = PLANET_COLORS[sc.type] || 0x00d4ff;
      const cfg = sc.config || {};
      const altKm = cfg.altitude || 550;
      const orbitRadius = 1 + (altKm / 6371) * 2;

      // Main object
      let geo;
      if (sc.type === 'satellite') geo = new THREE.BoxGeometry(0.04, 0.02, 0.04);
      else if (sc.type === 'rocket') geo = new THREE.CylinderGeometry(0.015, 0.02, 0.08, 8);
      else if (sc.type === 'station') geo = new THREE.TorusGeometry(0.04, 0.01, 8, 16);
      else geo = new THREE.BoxGeometry(0.05, 0.02, 0.06);

      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
      const mesh = new THREE.Mesh(geo, mat);

      // Glow sphere
      const glowGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      mesh.add(glow);

      // Orbit ring
      let orbitLine = null;
      if (sc.type === 'satellite' || sc.type === 'station') {
        const inc = (cfg.inclination || 53) * Math.PI / 180;
        const orbitPoints = [];
        for (let i = 0; i <= 128; i++) {
          const a = (i / 128) * Math.PI * 2;
          orbitPoints.push(new THREE.Vector3(
            orbitRadius * Math.cos(a),
            orbitRadius * Math.sin(a) * Math.sin(inc),
            orbitRadius * Math.sin(a) * Math.cos(inc)
          ));
        }
        const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
        orbitLine = new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 }));
        scene.add(orbitLine);
      }

      // Trail
      const trailCount = 60;
      const trailPositions = new Float32Array(trailCount * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, vertexColors: false }));
      scene.add(trail);

      // Rocket exhaust
      let exhaust = null;
      if (sc.type === 'rocket') {
        const exGeo = new THREE.ConeGeometry(0.015, 0.04, 8);
        const exMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8 });
        exhaust = new THREE.Mesh(exGeo, exMat);
        exhaust.position.y = -0.06;
        mesh.add(exhaust);
      }

      scene.add(mesh);

      objectsRef.current[sc.id] = {
        mesh, glow, orbitLine, trail, exhaust,
        type: sc.type,
        orbitAngle: (idx / spacecraft.length) * Math.PI * 2,
        orbitSpeed: 0.003 + Math.random() * 0.002,
        orbitRadius,
        inclination: cfg.inclination || 53,
        altitude: 0,
      };
    });
  }, [spacecraft]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        background: 'rgba(2,4,8,0.85)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 14px', fontSize: 11
      }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>Fleet</div>
        {[['satellite', '🛰️', '#00d4ff'], ['rocket', '🚀', '#ff6432'], ['station', '🔭', '#9664ff'], ['rover', '🤖', '#ffc832']].map(([type, icon, color]) => {
          const count = spacecraft.filter(s => s.type === type).length;
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
      <div style={{
        position: 'absolute', top: 16, right: 16,
        background: 'rgba(2,4,8,0.85)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)'
      }}>
        <div>🖱️ Drag to rotate</div>
        <div>🖱️ Scroll to zoom</div>
      </div>
    </div>
  );
};

// Helper: simple text sprite
function createLabel(text, size, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 40);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.5, 0.125, 1);
  return sprite;
}

export default OrbitalVisualiser;
