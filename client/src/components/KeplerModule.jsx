import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const DEG = Math.PI / 180

function computeOrbitPoints(aScaled, e, iDeg, raanDeg, argPerigeeDeg, segments = 128) {
  const i = iDeg * DEG
  const raan = raanDeg * DEG
  const argPerigee = argPerigeeDeg * DEG
  const cosRaan = Math.cos(raan)
  const sinRaan = Math.sin(raan)
  const cosI = Math.cos(i)
  const sinI = Math.sin(i)
  const cosArg = Math.cos(argPerigee)
  const sinArg = Math.sin(argPerigee)
  const points = []
  for (let k = 0; k <= segments; k++) {
    const nu = (k / segments) * Math.PI * 2
    const r = (aScaled * (1 - e * e)) / (1 + e * Math.cos(nu))
    const xp = r * Math.cos(nu)
    const yp = r * Math.sin(nu)
    const xw = xp * cosArg - yp * sinArg
    const yw = xp * sinArg + yp * cosArg
    const xi = xw
    const yi = yw * cosI
    const zi = yw * sinI
    const x = xi * cosRaan - yi * sinRaan
    const y = xi * sinRaan + yi * cosRaan
    const z = zi
    points.push(new THREE.Vector3(x, z, -y))
  }
  return points
}

function computePositionAtTrueAnomaly(aScaled, e, iDeg, raanDeg, argPerigeeDeg, nuDeg) {
  const nu = nuDeg * DEG
  const i = iDeg * DEG
  const raan = raanDeg * DEG
  const argPerigee = argPerigeeDeg * DEG
  const r = (aScaled * (1 - e * e)) / (1 + e * Math.cos(nu))
  const xp = r * Math.cos(nu)
  const yp = r * Math.sin(nu)
  const cosArg = Math.cos(argPerigee)
  const sinArg = Math.sin(argPerigee)
  const xw = xp * cosArg - yp * sinArg
  const yw = xp * sinArg + yp * cosArg
  const cosI = Math.cos(i)
  const sinI = Math.sin(i)
  const xi = xw
  const yi = yw * cosI
  const zi = yw * sinI
  const cosRaan = Math.cos(raan)
  const sinRaan = Math.sin(raan)
  const x = xi * cosRaan - yi * sinRaan
  const y = xi * sinRaan + yi * cosRaan
  const z = zi
  return new THREE.Vector3(x, z, -y)
}

function computeStationLocalPosition(radius, latDeg, lonDeg) {
  const lat = latDeg * DEG
  const lon = lonDeg * DEG
  const x = radius * Math.cos(lat) * Math.cos(lon)
  const y = radius * Math.sin(lat)
  const z = radius * Math.cos(lat) * Math.sin(lon)
  return new THREE.Vector3(x, y, z)
}

function computeReferenceDirection(decDeg, raDeg) {
  const dec = decDeg * DEG
  const ra = raDeg * DEG
  const eciX = Math.cos(dec) * Math.cos(ra)
  const eciY = Math.cos(dec) * Math.sin(ra)
  const eciZ = Math.sin(dec)
  return new THREE.Vector3(eciX, eciZ, -eciY)
}

function orbitalFramePoint(uDeg, iEffDeg, raanDeg, r) {
  const u = uDeg * DEG
  const iEff = iEffDeg * DEG
  const raan = raanDeg * DEG
  const xw = r * Math.cos(u)
  const yw = r * Math.sin(u)
  const xi = xw
  const yi = yw * Math.cos(iEff)
  const zi = yw * Math.sin(iEff)
  const x = xi * Math.cos(raan) - yi * Math.sin(raan)
  const y = xi * Math.sin(raan) + yi * Math.cos(raan)
  const z = zi
  return new THREE.Vector3(x, z, -y)
}

function generateRaanArc(raanDeg, r, segments = 48) {
  const points = []
  for (let k = 0; k <= segments; k++) {
    const sweep = (k / segments) * raanDeg
    points.push(orbitalFramePoint(0, 0, sweep, r))
  }
  return points
}

function generateInclinationArc(iDeg, raanDeg, r, segments = 48) {
  const points = []
  for (let k = 0; k <= segments; k++) {
    const sweep = (k / segments) * iDeg
    points.push(orbitalFramePoint(90, sweep, raanDeg, r))
  }
  return points
}

function generateArgPerigeeArc(argPerigeeDeg, iDeg, raanDeg, aScaled, e, segments = 48) {
  const points = []
  for (let k = 0; k <= segments; k++) {
    const sweep = (k / segments) * argPerigeeDeg
    const nu = (sweep - argPerigeeDeg) * DEG
    const r = (aScaled * (1 - e * e)) / (1 + e * Math.cos(nu))
    points.push(orbitalFramePoint(sweep, iDeg, raanDeg, r))
  }
  return points
}

function generateGreatCircleArc(v1, v2, segments = 48) {
  const points = []
  const angle = v1.angleTo(v2)
  const axis = new THREE.Vector3().crossVectors(v1, v2).normalize()
  if (axis.lengthSq() < 0.0001) return [v1, v2]
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * angle
    const pt = v1.clone().applyAxisAngle(axis, theta)
    points.push(pt)
  }
  return points
}

function createTextSprite(text, color, scale = 0.6) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.font = 'bold 48px sans-serif'
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 64)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(scale * 2, scale, 1)
  return sprite
}

function updateCurveLine(mesh, points, thickness) {
  if (!mesh || points.length < 2) return
  if (points.length === 2 && points[0].distanceTo(points[1]) < 0.001) return
  mesh.geometry.dispose()
  const curve = new THREE.CatmullRomCurve3(points)
  mesh.geometry = new THREE.TubeGeometry(curve, Math.max(32, points.length), thickness, 8, false)
  mesh.position.set(0, 0, 0)
  mesh.quaternion.identity()
}

function updateStraightLine(mesh, p1, p2, thickness) {
  if (!mesh) return
  const distance = p1.distanceTo(p2)
  if (distance < 0.001) {
    mesh.geometry.dispose()
    mesh.geometry = new THREE.BufferGeometry()
    return
  }
  mesh.geometry.dispose()
  mesh.geometry = new THREE.CylinderGeometry(thickness, thickness, distance, 8)
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5)
  mesh.position.copy(mid)
  const axis = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3().subVectors(p2, p1).normalize()
  mesh.quaternion.setFromUnitVectors(axis, dir)
}

const ControlItem = ({ label, value, onChange, min, max, step, disabled = false, isAngle = false }) => {
  const [localStr, setLocalStr] = useState(Number(value).toString())
  const [error, setError] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setLocalStr(Number(value).toString())
      setError(false)
    }
  }, [value, isFocused])

  const handleInput = (e) => {
    const val = e.target.value
    setLocalStr(val)
    if (val.trim() === '') {
      setError(true)
      return
    }
    const num = Number(val)
    if (isNaN(num) || num < min || num > max) {
      setError(true)
    } else {
      setError(false)
      onChange(num)
    }
  }

  const handleSlider = (e) => {
    const num = Number(e.target.value)
    setLocalStr(num.toString())
    setError(false)
    onChange(num)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px', gap: '5px', opacity: disabled ? 0.5 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input 
          type="range" min={min} max={max} step={step} 
          value={value} disabled={disabled} onChange={handleSlider} 
          style={{ flex: 1 }} 
        />
        <input 
          type="number" step={step} 
          value={localStr} disabled={disabled} 
          onChange={handleInput} 
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{ 
            width: '70px', padding: '4px', backgroundColor: '#334155', 
            color: 'white', border: error ? '1px solid #ef4444' : '1px solid #475569', 
            borderRadius: '4px', outline: 'none', textAlign: 'center', fontFamily: 'monospace'
          }} 
        />
      </div>
      {error && (
        <span style={{ color: '#ef4444', fontSize: '10px', fontWeight: 'bold' }}>
          Aralık {min} ve {max} arasında olmalıdır, tekrar giriniz.
        </span>
      )}
    </div>
  )
}

const KeplerModule = () => {
  const mountRef = useRef(null)
  
  const orbitLineRef = useRef(null)
  const satelliteRef = useRef(null)
  const radiusLineRef = useRef(null)
  const earthRef = useRef(null)
  const intervalRef = useRef(null)
  const stationRef = useRef(null)
  const stationLineRef = useRef(null)
  const referenceLineRef = useRef(null)
  const referenceOriginRef = useRef(null)
  
  const raanArcRef = useRef(null)
  const inclinationArcRef = useRef(null)
  const argPerigeeArcRef = useRef(null)
  const raanLabelRef = useRef(null)
  const inclinationLabelRef = useRef(null)
  const argPerigeeLabelRef = useRef(null)
  const vernalLabelRef = useRef(null)
  
  const raanEndSphereRef = useRef(null)
  const incEndSphereRef = useRef(null)
  const argPEndSphereRef = useRef(null)

  const arcPZRef = useRef(null)
  const arcPXRef = useRef(null)
  const arcZXRef = useRef(null)
  const labelPRef = useRef(null)
  const labelZRef = useRef(null)
  const labelXRef = useRef(null)
  const labelPZRef = useRef(null)
  const labelPXRef = useRef(null)
  const labelZXRef = useRef(null)

  const [aParam, setAParam] = useState(4)
  const [inclination, setInclination] = useState(45)
  const [raan, setRaan] = useState(60)
  const [argPerigee, setArgPerigee] = useState(30)
  const [eccentricity, setEccentricity] = useState(0.3)
  const [trueAnomaly, setTrueAnomaly] = useState(0)

  const [lon, setLon] = useState(29)
  const [pm, setPm] = useState(0)
  const [lat, setLat] = useState(39)

  const [t, setT] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  const [triInfo, setTriInfo] = useState({
    pz: 0, px: 0, zx: 0,
    p: 0, z: 0, x: 0,
    lat: 0, dec: 0, alt: 0,
    ra: 0, gast: 0, last: 0
  })

  const earthRadius = 2
  const referenceVectorLength = 8
  const miniSphereSize = 0.07 
  
  const arcThickness = 0.04
  const vectorThickness = 0.03

  const gast = (t * (360 / 86400)) % 360
  const last = (gast + lon + pm + 360) % 360

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const width = mount.clientWidth || window.innerWidth
    const height = mount.clientHeight || 500

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0f172a')

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
    camera.position.set(9, 7, 9)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambientLight)
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.9)
    sunLight.position.set(15, 15, 15)
    scene.add(sunLight)

    const starGeometry = new THREE.BufferGeometry()
    const starCount = 3000
    const starPositions = new Float32Array(starCount * 3)
    for (let idx = 0; idx < starCount; idx++) {
      starPositions[idx * 3] = (Math.random() - 0.5) * 400
      starPositions[idx * 3 + 1] = (Math.random() - 0.5) * 400
      starPositions[idx * 3 + 2] = (Math.random() - 0.5) * 400
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, sizeAttenuation: true })
    const stars = new THREE.Points(starGeometry, starMaterial)
    scene.add(stars)

    scene.add(new THREE.AxesHelper(earthRadius * 3))
    const gridHelper = new THREE.GridHelper(15 * 2.8, 40, 0x888888, 0x444444)
    scene.add(gridHelper)

    const equatorPlane = new THREE.Mesh(
      new THREE.CircleGeometry(15 * 1.4, 64),
      new THREE.MeshBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })
    )
    equatorPlane.rotation.x = Math.PI / 2
    scene.add(equatorPlane)

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(earthRadius, 48, 48),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.7, transparent: true, opacity: 0.25, depthWrite: false })
    )
    scene.add(earth)
    earthRef.current = earth

    earth.add(new THREE.Mesh(
      new THREE.SphereGeometry(earthRadius, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, wireframe: true, transparent: true, opacity: 0.3 })
    ))

    const station = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24 })
    )
    earth.add(station)
    stationRef.current = station

    const stationLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xfbbf24 }))
    earth.add(stationLine)
    stationLineRef.current = stationLine

    const orbitLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 }))
    scene.add(orbitLine)
    orbitLineRef.current = orbitLine

    const radiusLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 }))
    scene.add(radiusLine)
    radiusLineRef.current = radiusLine

    const satellite = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.2 })
    )
    scene.add(satellite)
    satelliteRef.current = satellite

    const referenceLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.3 }))
    scene.add(referenceLine)
    referenceLineRef.current = referenceLine

    const referenceOrigin = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xec4899 })
    )
    scene.add(referenceOrigin)
    referenceOriginRef.current = referenceOrigin

    const vernalLabel = createTextSprite('♈', '#ec4899', 0.9)
    scene.add(vernalLabel)
    vernalLabelRef.current = vernalLabel

    const raanArc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.3 }))
    scene.add(raanArc)
    raanArcRef.current = raanArc

    const inclinationArc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.3 }))
    scene.add(inclinationArc)
    inclinationArcRef.current = inclinationArc

    const argPerigeeArc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.3 }))
    scene.add(argPerigeeArc)
    argPerigeeArcRef.current = argPerigeeArc

    const createMiniSphere = (color) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(miniSphereSize, 16, 16),
        new THREE.MeshStandardMaterial({ color, roughness: 0.3 })
      )
      scene.add(mesh)
      return mesh
    }

    raanEndSphereRef.current = createMiniSphere(0x22d3ee)
    incEndSphereRef.current = createMiniSphere(0xa78bfa)
    argPEndSphereRef.current = createMiniSphere(0x84cc16)

    const raanLabel = createTextSprite('Ω', '#22d3ee')
    scene.add(raanLabel)
    raanLabelRef.current = raanLabel

    const inclinationLabel = createTextSprite('i', '#a78bfa')
    scene.add(inclinationLabel)
    inclinationLabelRef.current = inclinationLabel

    const argPerigeeLabel = createTextSprite('ω', '#84cc16')
    scene.add(argPerigeeLabel)
    argPerigeeLabelRef.current = argPerigeeLabel

    const arcPZ = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.3 }))
    scene.add(arcPZ)
    arcPZRef.current = arcPZ

    const arcPX = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#ec4899', roughness: 0.3 }))
    scene.add(arcPX)
    arcPXRef.current = arcPX

    const arcZX = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#d946ef', roughness: 0.3 }))
    scene.add(arcZX)
    arcZXRef.current = arcZX

    const labelP = createTextSprite('P', '#ffffff', 0.5)
    scene.add(labelP)
    labelPRef.current = labelP

    const labelZ = createTextSprite('Z', '#ffffff', 0.5)
    scene.add(labelZ)
    labelZRef.current = labelZ

    const labelX = createTextSprite('X', '#ffffff', 0.5)
    scene.add(labelX)
    labelXRef.current = labelX

    const labelPZ = createTextSprite('90° - φ', '#ef4444', 0.35)
    scene.add(labelPZ)
    labelPZRef.current = labelPZ

    const labelPX = createTextSprite('90° - δ', '#ec4899', 0.35)
    scene.add(labelPX)
    labelPXRef.current = labelPX

    const labelZX = createTextSprite('90° - a', '#d946ef', 0.35)
    scene.add(labelZX)
    labelZXRef.current = labelZX

    let animationId
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      const newWidth = mount.clientWidth || window.innerWidth
      const newHeight = mount.clientHeight || 500
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', handleResize)
      controls.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [])

  useEffect(() => {
    if (!referenceLineRef.current || !referenceOriginRef.current || !vernalLabelRef.current) return
    const direction = computeReferenceDirection(0, 0)
    const endPoint = direction.multiplyScalar(referenceVectorLength)
    updateStraightLine(referenceLineRef.current, new THREE.Vector3(0, 0, 0), endPoint, vectorThickness)
    referenceOriginRef.current.position.copy(endPoint)
    vernalLabelRef.current.position.copy(endPoint.clone().multiplyScalar(1.1))
  }, [])

  useEffect(() => {
    if (!orbitLineRef.current || !satelliteRef.current) return

    const points = computeOrbitPoints(aParam, eccentricity, inclination, raan, argPerigee)
    updateCurveLine(orbitLineRef.current, points, 0.05)

    const satPosition = computePositionAtTrueAnomaly(aParam, eccentricity, inclination, raan, argPerigee, trueAnomaly)
    satelliteRef.current.position.copy(satPosition)

    const vecX = satPosition.clone().normalize().multiplyScalar(earthRadius)
    const radiusTarget = satPosition.lengthSq() > vecX.lengthSq() ? satPosition : vecX
    updateStraightLine(radiusLineRef.current, new THREE.Vector3(0, 0, 0), radiusTarget, vectorThickness)

    if (earthRef.current) {
      earthRef.current.rotation.y = gast * DEG
      earthRef.current.updateMatrixWorld(true)
    }

    const stationPosition = computeStationLocalPosition(earthRadius, lat, lon)
    stationRef.current.position.copy(stationPosition)
    updateStraightLine(stationLineRef.current, new THREE.Vector3(0, 0, 0), stationPosition, vectorThickness)

    const rRaanDynamic = (aParam * (1 - eccentricity * eccentricity)) / (1 + eccentricity * Math.cos(-argPerigee * DEG))
    const raanPoints = generateRaanArc(raan, rRaanDynamic)
    updateCurveLine(raanArcRef.current, raanPoints, arcThickness)
    if (raanPoints.length > 0) {
      raanLabelRef.current.position.copy(raanPoints[Math.floor(raanPoints.length / 2)])
      raanEndSphereRef.current.position.copy(raanPoints[raanPoints.length - 1])
    }

    const nuAt90 = (90 - argPerigee) * DEG
    const rIncDynamic = (aParam * (1 - eccentricity * eccentricity)) / (1 + eccentricity * Math.cos(nuAt90))
    const inclinationPoints = generateInclinationArc(inclination, raan, rIncDynamic)
    updateCurveLine(inclinationArcRef.current, inclinationPoints, arcThickness)
    if (inclinationPoints.length > 0) {
      inclinationLabelRef.current.position.copy(inclinationPoints[Math.floor(inclinationPoints.length / 2)])
      incEndSphereRef.current.position.copy(inclinationPoints[inclinationPoints.length - 1])
    }

    const argPerigeePoints = generateArgPerigeeArc(argPerigee, inclination, raan, aParam, eccentricity)
    updateCurveLine(argPerigeeArcRef.current, argPerigeePoints, 0.055)
    if (argPerigeePoints.length > 0) {
      argPerigeeLabelRef.current.position.copy(argPerigeePoints[Math.floor(argPerigeePoints.length / 2)])
      argPEndSphereRef.current.position.copy(argPerigeePoints[argPerigeePoints.length - 1])
    }

    const vecP = new THREE.Vector3(0, earthRadius, 0)
    
    const stationWorldPos = new THREE.Vector3()
    stationRef.current.getWorldPosition(stationWorldPos)
    const vecZ = stationWorldPos.clone().normalize().multiplyScalar(earthRadius)
    
    const pointsPZ = generateGreatCircleArc(vecP, vecZ)
    updateCurveLine(arcPZRef.current, pointsPZ, 0.035)

    const pointsPX = generateGreatCircleArc(vecP, vecX)
    updateCurveLine(arcPXRef.current, pointsPX, 0.035)

    const pointsZX = generateGreatCircleArc(vecZ, vecX)
    updateCurveLine(arcZXRef.current, pointsZX, 0.035)

    const labelHoverDistance = 1.15
    labelPRef.current.position.copy(vecP.clone().multiplyScalar(labelHoverDistance))
    labelZRef.current.position.copy(vecZ.clone().multiplyScalar(labelHoverDistance))
    labelXRef.current.position.copy(vecX.clone().multiplyScalar(labelHoverDistance))

    if (pointsPZ.length > 0) {
        labelPZRef.current.position.copy(pointsPZ[Math.floor(pointsPZ.length / 2)].clone().multiplyScalar(labelHoverDistance))
    }
    if (pointsPX.length > 0) {
        labelPXRef.current.position.copy(pointsPX[Math.floor(pointsPX.length / 2)].clone().multiplyScalar(labelHoverDistance))
    }
    if (pointsZX.length > 0) {
        labelZXRef.current.position.copy(pointsZX[Math.floor(pointsZX.length / 2)].clone().multiplyScalar(labelHoverDistance))
    }

    const x_eci = satPosition.x
    const y_eci = -satPosition.z
    const z_eci = satPosition.y
    const r_eci = Math.sqrt(x_eci*x_eci + y_eci*y_eci + z_eci*z_eci)

    const decRad = Math.asin(z_eci / r_eci)
    const decDeg = decRad * (180 / Math.PI)

    let raDeg = Math.atan2(y_eci, x_eci) * (180 / Math.PI)
    if (raDeg < 0) raDeg += 360

    let lstDeg = (gast + lon) % 360
    if (lstDeg < 0) lstDeg += 360

    let hDeg = (lstDeg - raDeg) % 360
    if (hDeg < 0) hDeg += 360

    const latRad = lat * (Math.PI / 180)
    const hRad = hDeg * (Math.PI / 180)

    const sin_a = Math.sin(decRad)*Math.sin(latRad) + Math.cos(decRad)*Math.cos(latRad)*Math.cos(hRad)
    const aRad = Math.asin(sin_a)
    const aDeg = aRad * (180 / Math.PI)
    const zxDeg = 90 - aDeg

    const cos_A = (Math.sin(decRad) - Math.sin(latRad)*sin_a) / (Math.cos(latRad)*Math.cos(aRad))
    const sin_A = -Math.sin(hRad)*Math.cos(decRad) / Math.cos(aRad)
    let aAzRad = Math.atan2(sin_A, cos_A)
    let aAzDeg = aAzRad * (180 / Math.PI)
    if (aAzDeg < 0) aAzDeg += 360

    const sin_q = Math.sin(hRad) * Math.cos(latRad) / Math.cos(aRad)
    const cos_q = (Math.sin(latRad) - Math.sin(decRad)*sin_a) / (Math.cos(decRad)*Math.cos(aRad))
    let qRad = Math.atan2(sin_q, cos_q)
    let qDeg = qRad * (180 / Math.PI)

    setTriInfo({
      pz: 90 - lat,
      px: 90 - decDeg,
      zx: zxDeg,
      p: hDeg,
      z: aAzDeg,
      x: Math.abs(qDeg),
      lat: lat,
      dec: decDeg,
      alt: aDeg,
      ra: raDeg,
      gast: gast,
      last: lstDeg
    })

  }, [aParam, inclination, raan, argPerigee, eccentricity, trueAnomaly, gast, lat, lon])

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setTrueAnomaly(prev => (prev + speed * 1.5) % 360)
        setT(prev => prev + speed * 120)
      }, 50)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, speed])

  const handleStop = () => {
    setIsPlaying(false)
    setTrueAnomaly(0)
    setT(0)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100vh', width: '100%', backgroundColor: '#1e293b', color: 'white', fontFamily: 'sans-serif', overflow: 'hidden', boxSizing: 'border-box' }}>
      
      <div ref={mountRef} style={{ flex: 1, position: 'relative' }} />
      
      <div style={{ width: '400px', minWidth: '400px', display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', paddingBottom: '80px', backgroundColor: '#0f172a', borderLeft: '2px solid #334155', overflowY: 'auto', boxSizing: 'border-box' }}>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={{ flex: 1, padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setIsPlaying(prev => !prev)}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button style={{ flex: 1, padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }} onClick={handleStop}>
            Stop
          </button>
        </div>

        <ControlItem label="Speed" value={speed} onChange={setSpeed} min={0.1} max={5} step={0.1} />
        <ControlItem label="Orbit Size (Semi-Major Axis, a)" value={aParam} onChange={setAParam} min={2.1} max={15} step={0.1} />
        <ControlItem label="Inclination (i) °" value={inclination} onChange={setInclination} min={0} max={180} step={1} isAngle={true} />
        <ControlItem label="RAAN (Ω) °" value={raan} onChange={setRaan} min={0} max={360} step={1} isAngle={true} />
        
        <ControlItem 
          label="Argument of Perigee (ω) °" 
          value={argPerigee} 
          onChange={setArgPerigee} 
          min={0} max={360} step={1} 
          disabled={eccentricity === 0} 
          isAngle={true} 
        />
        
        <ControlItem label="Eccentricity (e)" value={eccentricity} onChange={setEccentricity} min={0} max={0.99} step={0.01} />
        <ControlItem label="True Anomaly (ν) °" value={trueAnomaly} onChange={setTrueAnomaly} min={0} max={360} step={0.1} isAngle={true} />

        <hr style={{ borderColor: '#334155', width: '100%', margin: '5px 0' }} />

        <ControlItem label="Station Latitude (φ) °" value={lat} onChange={setLat} min={-90} max={90} step={1} isAngle={true} />
        <ControlItem label="Station Longitude (lon) °" value={lon} onChange={setLon} min={-180} max={180} step={1} isAngle={true} />

        <hr style={{ borderColor: '#334155', width: '100%', margin: '5px 0' }} />

        <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ color: '#ffffff', fontWeight: 'bold' }}>Live Readouts & Terminology</span>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
             <div style={{ backgroundColor: '#1e293b', padding: '6px', borderRadius: '4px' }}>
                <div style={{ color: '#cbd5e1', fontSize: '11px' }}>GAST (Greenwich Apparent Sidereal Time)</div>
                <div style={{ fontWeight: 'bold' }}>{triInfo.gast.toFixed(2)}°</div>
             </div>
             <div style={{ backgroundColor: '#1e293b', padding: '6px', borderRadius: '4px' }}>
                <div style={{ color: '#cbd5e1', fontSize: '11px' }}>LAST (Local Apparent Sidereal Time)</div>
                <div style={{ fontWeight: 'bold' }}>{triInfo.last.toFixed(2)}°</div>
             </div>
             <div style={{ backgroundColor: '#1e293b', padding: '6px', borderRadius: '4px' }}>
                <div style={{ color: '#cbd5e1', fontSize: '11px' }}>Sat. Right Ascension (RA / α)</div>
                <div style={{ fontWeight: 'bold' }}>{triInfo.ra.toFixed(2)}°</div>
             </div>
             <div style={{ backgroundColor: '#1e293b', padding: '6px', borderRadius: '4px' }}>
                <div style={{ color: '#cbd5e1', fontSize: '11px' }}>Sat. Declination (Dec / δ)</div>
                <div style={{ fontWeight: 'bold' }}>{triInfo.dec.toFixed(2)}°</div>
             </div>
          </div>

          <span style={{ color: '#ffffff', fontWeight: 'bold', marginTop: '10px' }}>Terrestrial Triangle (P, Z, X)</span>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: '#1e293b', padding: '8px', borderRadius: '6px' }}>
            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>● Side PZ (Co-latitude)</span>
            <span style={{ color: '#94a3b8' }}>Formula: 90° - φ</span>
            <span style={{ color: '#cbd5e1' }}>Values: 90° - ({triInfo.lat.toFixed(2)}°) = <b>{triInfo.pz.toFixed(2)}°</b></span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: '#1e293b', padding: '8px', borderRadius: '6px' }}>
            <span style={{ color: '#ec4899', fontWeight: 'bold' }}>● Side PX (Polar Distance)</span>
            <span style={{ color: '#94a3b8' }}>Formula: 90° - δ</span>
            <span style={{ color: '#cbd5e1' }}>Values: 90° - ({triInfo.dec.toFixed(2)}°) = <b>{triInfo.px.toFixed(2)}°</b></span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: '#1e293b', padding: '8px', borderRadius: '6px' }}>
            <span style={{ color: '#d946ef', fontWeight: 'bold' }}>● Side ZX (Zenith Distance)</span>
            <span style={{ color: '#94a3b8' }}>Formula: 90° - a</span>
            <span style={{ color: '#cbd5e1' }}>Values: 90° - ({triInfo.alt.toFixed(2)}°) = <b>{triInfo.zx.toFixed(2)}°</b></span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: '#1e293b', padding: '8px', borderRadius: '6px' }}>
            <span style={{ color: '#ffffff', fontWeight: 'bold' }}>● Angle P (Hour Angle H)</span>
            <span style={{ color: '#94a3b8' }}>Formula: LAST - RA</span>
            <span style={{ color: '#cbd5e1' }}>Values: <b>{triInfo.p.toFixed(2)}°</b></span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: '#1e293b', padding: '8px', borderRadius: '6px' }}>
            <span style={{ color: '#ffffff', fontWeight: 'bold' }}>● Angle Z (Azimuth A)</span>
            <span style={{ color: '#94a3b8' }}>Formula: sin(A) = -sin(H)cos(δ)/cos(a)</span>
            <span style={{ color: '#cbd5e1' }}>Values: <b>{triInfo.z.toFixed(2)}°</b></span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', backgroundColor: '#1e293b', padding: '8px', borderRadius: '6px' }}>
            <span style={{ color: '#ffffff', fontWeight: 'bold' }}>● Angle X (Parallactic Angle q)</span>
            <span style={{ color: '#94a3b8' }}>Formula: sin(q) = sin(H)cos(φ)/cos(a)</span>
            <span style={{ color: '#cbd5e1' }}>Values: <b>{triInfo.x.toFixed(2)}°</b></span>
          </div>

          <span style={{ color: '#ffffff', fontWeight: 'bold', marginTop: '10px' }}>Vectors & Nodes Overview</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: '#1e293b', padding: '8px', borderRadius: '6px' }}>
            <span style={{ color: '#fbbf24' }}>● <b>Earth Station:</b> Observer's location on Earth.</span>
            <span style={{ color: '#ec4899' }}>● <b>Vernal Equinox (♈):</b> Fixed universal reference direction (RA=0, Dec=0).</span>
            <span style={{ color: '#10b981' }}>● <b>Radius Vector:</b> Distance and direction from Earth center to Satellite.</span>
            <span style={{ color: '#22d3ee' }}>● <b>Ω Node (Cyan):</b> Ascending Node (orbit crosses equator northwards).</span>
            <span style={{ color: '#a78bfa' }}>● <b>i Node (Purple):</b> Maximum latitude point of the orbit.</span>
            <span style={{ color: '#84cc16' }}>● <b>ω Node (Green):</b> Perigee (the point closest to Earth in the orbit).</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KeplerModule