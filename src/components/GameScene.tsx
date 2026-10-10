import { ContactShadows, Float, RoundedBox, Sparkles } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import type { GameStage, HandData } from "../types"

type SceneProps = {
  stage: GameStage
  hand: HandData
  shotId: number
  launch: HandData | null
  onShotComplete: (made: boolean) => void
  paused: boolean
}

const PAPER_START = new THREE.Vector3(-1.35, 0.84, 1.05)
const BASKET = new THREE.Vector3(1.5, 0.72, -2)

function Wastebasket() {
  return (
    <group position={BASKET}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.4, 1.25, 24, 1, true]} />
        <meshStandardMaterial
          color="#27302e"
          roughness={0.4}
          metalness={0.55}
          wireframe
        />
      </mesh>
      <mesh position={[0, -0.59, 0]} receiveShadow>
        <cylinderGeometry args={[0.4, 0.36, 0.07, 24]} />
        <meshStandardMaterial color="#161d1b" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.035, 10, 32]} />
        <meshStandardMaterial
          color="#67736e"
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>
    </group>
  )
}

function Paper({
  stage,
  hand,
  shotId,
  launch,
  onShotComplete,
  paused,
}: SceneProps) {
  const group = useRef<THREE.Group>(null)
  const sheet = useRef<THREE.Mesh>(null)
  const ball = useRef<THREE.Mesh>(null)
  const velocity = useRef(new THREE.Vector3())
  const [resolvedShot, setResolvedShot] = useState(-1)
  const foldAmount = useRef(0)
  const isBall = stage === "throw" || stage === "flying" || stage === "result"
  const heldPosition = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (stage === "flying" && launch && group.current) {
      velocity.current.set(
        THREE.MathUtils.clamp(2.3 + launch.velocityX * 1.5, 0.8, 5.5),
        THREE.MathUtils.clamp(
          1.8 + Math.max(launch.velocityY, 0) * 0.8,
          1.8,
          5,
        ),
        THREE.MathUtils.clamp(
          -4.2 - Math.max(launch.velocityZ, 0) * 0.8,
          -7,
          -3.8,
        ),
      )
      setResolvedShot(-1)
    }
  }, [stage, launch, shotId])

  useFrame((_, delta) => {
    if (!group.current || paused) return
    const dt = Math.min(delta, 0.034)
    foldAmount.current = THREE.MathUtils.lerp(
      foldAmount.current,
      isBall ? 1 : 0,
      dt * 8,
    )
    const fold = foldAmount.current
    if (sheet.current) {
      sheet.current.visible = fold < 0.97
      sheet.current.scale.set(
        THREE.MathUtils.lerp(1, 0.28, fold),
        THREE.MathUtils.lerp(1, 0.42, fold),
        THREE.MathUtils.lerp(1, 0.3, fold),
      )
    }
    if (ball.current) {
      ball.current.visible = fold > 0.05
      ball.current.scale.setScalar(THREE.MathUtils.lerp(0.12, 0.42, fold))
    }

    if (stage === "lift" || stage === "fold" || stage === "throw") {
      if (hand.detected) {
        heldPosition.set(
          THREE.MathUtils.lerp(-2.5, 2.4, hand.x),
          stage === "lift"
            ? THREE.MathUtils.lerp(0.86, 2.75, Math.max(0.12, hand.y))
            : THREE.MathUtils.lerp(1.45, 3, hand.y),
          0.55,
        )
      } else {
        heldPosition.copy(
          stage === "lift" ? PAPER_START : new THREE.Vector3(-0.6, 1.85, 0.55),
        )
      }
      group.current.position.lerp(heldPosition, 1 - Math.pow(0.002, dt))
      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        hand.detected ? (hand.x - 0.5) * -0.32 : -0.05,
        dt * 4,
      )
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        -0.12,
        dt * 5,
      )
    }

    if (stage === "flying") {
      velocity.current.y -= 9.4 * dt
      velocity.current.x *= 1 - dt * 0.08
      velocity.current.z *= 1 - dt * 0.05
      group.current.position.addScaledVector(velocity.current, dt)
      group.current.rotation.x += dt * 8.5
      group.current.rotation.z += dt * 5.2

      const p = group.current.position
      const overOpening =
        Math.hypot(p.x - BASKET.x, p.z - BASKET.z) < 0.5 &&
        p.y < 1.8 &&
        p.y > 0.55
      if (overOpening && velocity.current.y < 0 && resolvedShot !== shotId) {
        setResolvedShot(shotId)
        onShotComplete(true)
      } else if (
        (p.y < 0.74 || p.z < -4 || Math.abs(p.x) > 5) &&
        resolvedShot !== shotId
      ) {
        setResolvedShot(shotId)
        onShotComplete(false)
      }
    }
  })

  return (
    <group ref={group} position={PAPER_START}>
      <mesh ref={sheet} castShadow>
        <boxGeometry args={[1.25, 0.035, 1.7, 8, 1, 8]} />
        <meshStandardMaterial color="#f7f4e9" roughness={0.72} />
      </mesh>
      <mesh ref={ball} castShadow visible={false}>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial color="#f3f0e5" roughness={0.92} flatShading />
      </mesh>
    </group>
  )
}

function Room() {
  return (
    <>
      <color attach="background" args={["#dfe2dc"]} />
      <fog attach="fog" args={["#dfe2dc", 9, 18]} />
      <ambientLight intensity={1.5} />
      <directionalLight
        castShadow
        position={[-3, 7, 5]}
        intensity={3.1}
        color="#fff8e7"
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[4, 4, 1]} intensity={18} color="#dbe9df" />

      <mesh position={[0, 0.35, 0]} receiveShadow>
        <boxGeometry args={[10, 0.65, 7]} />
        <meshStandardMaterial color="#805a38" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.69, 0]} receiveShadow>
        <boxGeometry args={[10.1, 0.06, 7.1]} />
        <meshStandardMaterial color="#a9764d" roughness={0.5} />
      </mesh>
      {[-3.6, 3.6].map((x) => (
        <mesh key={x} position={[x, -1.15, 2.1]} castShadow>
          <boxGeometry args={[0.35, 3.2, 0.45]} />
          <meshStandardMaterial color="#3f3026" roughness={0.7} />
        </mesh>
      ))}
      <RoundedBox
        args={[1.4, 1.05, 0.08]}
        radius={0.06}
        position={[-2.7, 3.2, -3.15]}
      >
        <meshStandardMaterial color="#f2eee3" roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 3.7, -3.25]} receiveShadow>
        <planeGeometry args={[12, 7]} />
        <meshStandardMaterial color="#d4d8d1" roughness={1} />
      </mesh>
      <Wastebasket />
      <ContactShadows
        position={[0, 0.71, 0]}
        opacity={0.45}
        scale={9}
        blur={2.8}
        far={4}
      />
    </>
  )
}

export default function GameScene(
  props: SceneProps & { celebration: boolean },
) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 3.8, 7.6], fov: 42 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <Room />
      <Paper {...props} />
      {props.stage === "throw" && (
        <Float speed={2.5} rotationIntensity={0.2} floatIntensity={0.25}>
          <mesh position={[BASKET.x, 2.05, BASKET.z]}>
            <torusGeometry args={[0.68, 0.025, 8, 48]} />
            <meshBasicMaterial color="#b7ef80" transparent opacity={0.65} />
          </mesh>
        </Float>
      )}
      {props.celebration && (
        <Sparkles
          count={70}
          scale={[3.2, 3, 2.5]}
          position={BASKET}
          color="#dff88f"
          speed={1.4}
        />
      )}
    </Canvas>
  )
}
