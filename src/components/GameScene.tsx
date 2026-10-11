import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import * as THREE from "three"
import type { BallState, LevelConfig } from "../game/types"

export type SceneHandle = {
  throwBall: (power: number, lateral: number) => void
}

type Props = {
  level: LevelConfig
  ballState: BallState
  paused: boolean
  onOutcome: (scored: boolean) => void
}

function makeCrumpledBall() {
  const geometry = new THREE.IcosahedronGeometry(0.18, 2)
  const positions = geometry.attributes.position
  const vector = new THREE.Vector3()
  for (let index = 0; index < positions.count; index++) {
    vector.fromBufferAttribute(positions, index)
    const noise =
      Math.sin(vector.x * 27 + vector.y * 19) * Math.cos(vector.z * 31) * 0.055
    vector.multiplyScalar(1 + noise)
    positions.setXYZ(index, vector.x, vector.y, vector.z)
  }
  geometry.computeVertexNormals()
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xf4f0e6,
      roughness: 0.82,
      metalness: 0,
    }),
  )
}

const GameScene = forwardRef<SceneHandle, Props>(function GameScene(
  { level, ballState, paused, onOutcome },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null)
  const throwRef = useRef<(power: number, lateral: number) => void>(() => {})
  const ballStateRef = useRef(ballState)
  const pausedRef = useRef(paused)
  const outcomeRef = useRef(onOutcome)

  useImperativeHandle(ref, () => ({
    throwBall: (power, lateral) => throwRef.current(power, lateral),
  }))

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const quality =
      window.innerWidth < 700 ? 1 : Math.min(devicePixelRatio, 1.6)
    const scene = new THREE.Scene()
    const palettes = {
      morning: { bg: 0xe7dfcf, wall: 0xddd3c1, accent: 0x65745f },
      greenhouse: { bg: 0xd8dfd2, wall: 0xc7d2c2, accent: 0x4e6855 },
      evening: { bg: 0x353a3a, wall: 0x454b49, accent: 0xb67852 },
    }
    const palette = palettes[level.palette]
    scene.background = new THREE.Color(palette.bg)
    scene.fog = new THREE.Fog(palette.bg, 8, 15)

    const camera = new THREE.PerspectiveCamera(
      window.innerWidth < 600 ? 56 : 48,
      1,
      0.1,
      40,
    )
    camera.position.set(0, 3.25, 5.2)
    camera.lookAt(0, 0.75, -2.2)
    const renderer = new THREE.WebGLRenderer({ antialias: quality > 1 })
    renderer.setPixelRatio(quality)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = quality > 1
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xfff5df, 0x48514b, 2.2))
    const sunlight = new THREE.DirectionalLight(0xffe5bd, 3.2)
    sunlight.position.set(-4, 7, 5)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(1024, 1024)
    scene.add(sunlight)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 24),
      new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 0.96 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.2, 3.1),
      new THREE.MeshStandardMaterial({
        color: level.palette === "evening" ? 0x76563f : 0x9d7253,
        roughness: 0.52,
      }),
    )
    desk.position.set(0, 0.74, 2.5)
    desk.receiveShadow = true
    desk.castShadow = true
    scene.add(desk)

    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.18, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xfffdf7,
        roughness: 0.88,
        side: THREE.DoubleSide,
      }),
    )
    sheet.rotation.x = -Math.PI / 2
    sheet.rotation.z = -0.14
    sheet.position.set(-0.1, 0.855, 2.25)
    sheet.receiveShadow = true
    scene.add(sheet)
    const paperLines: THREE.Mesh[] = []
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xd7d5ce })
    for (let row = 0; row < 4; row++) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.52, 0.012),
        lineMaterial,
      )
      line.rotation.x = -Math.PI / 2
      line.rotation.z = -0.14
      line.position.set(-0.08, 0.859, 2.04 + row * 0.14)
      scene.add(line)
      paperLines.push(line)
    }

    const basketGroup = new THREE.Group()
    const basketY = 0.64
    const basketZ = 2.8 - level.distance
    basketGroup.position.set(0, 0, basketZ)
    const basket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.43, 0.32, 1.15, 20, 8, true),
      new THREE.MeshStandardMaterial({
        color: palette.accent,
        roughness: 0.72,
        metalness: 0.12,
        wireframe: true,
      }),
    )
    basket.position.y = basketY
    basket.castShadow = true
    basketGroup.add(basket)
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.045, 10, 36),
      new THREE.MeshStandardMaterial({
        color: palette.accent,
        roughness: 0.42,
        metalness: 0.28,
      }),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.y = 1.22
    basketGroup.add(rim)
    scene.add(basketGroup)

    const plant = new THREE.Group()
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.24, 0.55, 16),
      new THREE.MeshStandardMaterial({ color: 0x8a5d44, roughness: 0.8 }),
    )
    pot.position.y = 0.28
    plant.add(pot)
    for (let index = 0; index < 7; index++) {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x536d55, roughness: 0.9 }),
      )
      leaf.scale.set(0.6, 1.8, 0.35)
      leaf.position.set(
        Math.sin(index * 2.2) * 0.28,
        0.65 + (index % 3) * 0.18,
        Math.cos(index * 2.2) * 0.18,
      )
      leaf.rotation.z = Math.sin(index) * 0.8
      plant.add(leaf)
    }
    plant.position.set(-2.4, 0.86, 2.1)
    scene.add(plant)

    const ball = makeCrumpledBall()
    ball.visible = false
    ball.castShadow = true
    scene.add(ball)
    let velocity = new THREE.Vector3()
    let inFlight = false
    let resolved = false
    let lastY = 1.2
    let flightTime = 0

    throwRef.current = (power, lateral) => {
      const normalized = Math.max(0.22, Math.min(1, power))
      ball.visible = true
      ball.scale.setScalar(1)
      ball.position.set(0, 1.35, 2.45)
      const forwardSpeed = 5 + normalized * 2.7
      const verticalSpeed =
        2.8 + normalized * 1.5 + Math.max(0, level.distance - 5.5) * 0.3
      velocity.set(lateral * 1.15, verticalSpeed, -forwardSpeed)
      inFlight = true
      resolved = false
      flightTime = 0
      lastY = ball.position.y
    }

    const resize = () => {
      const { clientWidth, clientHeight } = mount
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / Math.max(1, clientHeight)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const particles: Array<{
      mesh: THREE.Mesh
      velocity: THREE.Vector3
      life: number
    }> = []
    const celebrate = () => {
      for (let index = 0; index < 28; index++) {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.045, 0.12),
          new THREE.MeshBasicMaterial({
            color: [0xe6b85c, 0x829b76, 0xf5ead7][index % 3],
            side: THREE.DoubleSide,
          }),
        )
        mesh.position.set(0, 1.1, basketZ)
        scene.add(mesh)
        particles.push({
          mesh,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            1.5 + Math.random() * 2.4,
            (Math.random() - 0.5) * 2,
          ),
          life: 1,
        })
      }
    }

    const clock = new THREE.Clock()
    let animationFrame = 0
    const animate = () => {
      animationFrame = requestAnimationFrame(animate)
      const dt = Math.min(clock.getDelta(), 0.033)
      sheet.visible = ballStateRef.current === "sheet"
      paperLines.forEach((line) => {
        line.visible = ballStateRef.current === "sheet"
      })
      if (!inFlight) {
        ball.visible =
          ballStateRef.current === "held" || ballStateRef.current === "crumpled"
        if (ball.visible) {
          ball.position.set(
            0,
            ballStateRef.current === "held" ? 1.42 : 1.35,
            2.45,
          )
          const heldScale = ballStateRef.current === "held" ? 0.45 : 1
          ball.scale.lerp(
            new THREE.Vector3(heldScale, heldScale, heldScale),
            0.12,
          )
        }
      }
      if (!pausedRef.current && inFlight) {
        flightTime += dt
        lastY = ball.position.y
        const windPulse = Math.sin(flightTime * 2.2) * level.wind
        velocity.x += (level.wind + windPulse * 0.35) * dt
        velocity.y -= 9.81 * dt
        velocity.multiplyScalar(Math.pow(0.992, dt * 60))
        ball.position.addScaledVector(velocity, dt)
        ball.rotation.x += velocity.z * dt * 1.7
        ball.rotation.z += velocity.x * dt * 2.2
        const horizontal = Math.hypot(
          ball.position.x,
          ball.position.z - basketZ,
        )
        if (
          !resolved &&
          lastY >= 1.22 &&
          ball.position.y < 1.22 &&
          horizontal < 0.34 &&
          velocity.y < 0
        ) {
          resolved = true
          celebrate()
          window.setTimeout(() => outcomeRef.current(true), 520)
        }
        const rimDistance = Math.abs(horizontal - 0.44)
        if (
          !resolved &&
          ball.position.y > 1.12 &&
          ball.position.y < 1.34 &&
          rimDistance < 0.1
        ) {
          const outward = new THREE.Vector3(
            ball.position.x,
            0,
            ball.position.z - basketZ,
          ).normalize()
          velocity.addScaledVector(outward, 2.2)
          velocity.y = Math.abs(velocity.y) * 0.35
        }
        const hitsBasketSide =
          !resolved &&
          ball.position.y < 1.18 &&
          ball.position.y > 0.15 &&
          horizontal > 0.3 &&
          horizontal < 0.52
        if (hitsBasketSide) {
          const outward = new THREE.Vector3(
            ball.position.x,
            0,
            ball.position.z - basketZ,
          ).normalize()
          velocity.addScaledVector(outward, 1.3)
          velocity.multiplyScalar(0.72)
        }
        const hitsDesk =
          lastY >= 0.86 &&
          ball.position.y < 0.86 &&
          Math.abs(ball.position.x) < 3.6 &&
          ball.position.z > 0.95 &&
          ball.position.z < 4.05
        if (hitsDesk) {
          ball.position.y = 0.94
          velocity.y = Math.abs(velocity.y) * 0.3
          velocity.x *= 0.72
          velocity.z *= 0.72
        }
        if (ball.position.y < 0.18) {
          ball.position.y = 0.18
          velocity.y *= -0.28
          velocity.x *= 0.68
          velocity.z *= 0.68
          if (!resolved && (flightTime > 2.2 || velocity.length() < 0.65)) {
            resolved = true
            window.setTimeout(() => outcomeRef.current(false), 300)
          }
        }
        if (
          !resolved &&
          (flightTime > 5 ||
            Math.abs(ball.position.x) > 7 ||
            ball.position.z < -10)
        ) {
          resolved = true
          outcomeRef.current(false)
        }
      }
      particles.forEach((particle) => {
        particle.life -= dt
        particle.velocity.y -= 4.5 * dt
        particle.mesh.position.addScaledVector(particle.velocity, dt)
        particle.mesh.rotation.x += dt * 4
        particle.mesh.rotation.z += dt * 3
        ;(particle.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
          0,
          particle.life,
        )
        ;(particle.mesh.material as THREE.MeshBasicMaterial).transparent = true
      })
      for (let index = particles.length - 1; index >= 0; index--) {
        if (particles[index].life <= 0) {
          scene.remove(particles[index].mesh)
          particles[index].mesh.geometry.dispose()
          ;(particles[index].mesh.material as THREE.Material).dispose()
          particles.splice(index, 1)
        }
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      renderer.dispose()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          if (Array.isArray(object.material))
            object.material.forEach((item) => item.dispose())
          else object.material.dispose()
        }
      })
      mount.removeChild(renderer.domElement)
    }
  }, [level])

  useEffect(() => {
    ballStateRef.current = ballState
    pausedRef.current = paused
    outcomeRef.current = onOutcome
    const canvas = mountRef.current?.querySelector("canvas")
    if (canvas) canvas.dataset.ballState = ballState
  }, [ballState, onOutcome, paused])

  return (
    <div
      ref={mountRef}
      className="game-canvas"
      aria-label="3D paper throwing scene"
    />
  )
})

export default GameScene
