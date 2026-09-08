import { type CharacterLook, characterLook } from "@/lib/characterLooks";

/**
 * Appearance-only meshes for the player avatar, split per body part so the
 * animation rig in Angler.tsx keeps owning every group/ref/anchor. Each part
 * renders in the exact same local space as the original hard-coded avatar, so
 * swapping presets never moves the rod, hands or camera anchors.
 */

/* ------------------------------- legs ---------------------------------- */

export function CharacterLegs({ look, side }: { look: CharacterLook; side: number }) {
  const w = 0.95 * look.build;
  return (
    <>
      {/* thigh / trouser */}
      <mesh position={[0, -0.72, 0]} castShadow>
        <boxGeometry args={[w, look.legStyle === "shorts" ? 0.95 : 1.45, w]} />
        <meshStandardMaterial color={look.pants} roughness={0.9} />
      </mesh>

      {look.legStyle === "ripped" &&
        [0.15, -0.35, -0.9].map((y, i) => (
          <mesh key={y} position={[i % 2 === 0 ? 0.2 : -0.24, y - 0.35, 0.49]}>
            <boxGeometry args={[0.3, 0.16, 0.02]} />
            <meshStandardMaterial color={look.pantsAlt} roughness={0.9} />
          </mesh>
        ))}

      {look.legStyle === "shorts" && (
        <>
          {/* bare shin */}
          <mesh position={[0, -1.5, 0]} castShadow>
            <boxGeometry args={[w * 0.72, 0.95, w * 0.72]} />
            <meshStandardMaterial color={look.skin} roughness={0.75} />
          </mesh>
          <mesh position={[0, -1.18, 0]}>
            <boxGeometry args={[w * 1.02, 0.12, w * 1.02]} />
            <meshStandardMaterial color={look.pantsAlt} roughness={0.8} />
          </mesh>
        </>
      )}

      {look.legStyle === "waders" && (
        <>
          {/* rubber wader shell, wider and glossier */}
          <mesh position={[0, -1.2, 0]} castShadow>
            <boxGeometry args={[w * 1.08, 1.4, w * 1.08]} />
            <meshStandardMaterial color={look.pants} roughness={0.45} />
          </mesh>
          <mesh position={[side * 0.3, -0.45, 0.52]}>
            <boxGeometry args={[0.22, 0.5, 0.03]} />
            <meshStandardMaterial color={look.pantsAlt} roughness={0.6} />
          </mesh>
        </>
      )}

      {look.legStyle === "legging" && (
        <>
          <mesh position={[0, -1.42, 0]} castShadow>
            <boxGeometry args={[w * 0.82, 1.05, w * 0.82]} />
            <meshStandardMaterial color={look.pants} roughness={0.55} />
          </mesh>
          {/* neon side stripe */}
          <mesh position={[side * (w * 0.44), -1.0, 0]}>
            <boxGeometry args={[0.04, 1.9, 0.16]} />
            <meshStandardMaterial
              color={look.accent}
              emissive={look.accent}
              emissiveIntensity={0.5}
              roughness={0.4}
            />
          </mesh>
        </>
      )}

      {/* cuff */}
      {look.footStyle !== "boot" && (
        <mesh position={[0, -1.52, 0]} castShadow>
          <boxGeometry args={[w * 1.05, 0.18, w * 1.05]} />
          <meshStandardMaterial color={look.shoeAlt} roughness={0.9} />
        </mesh>
      )}

      {/* footwear */}
      {look.footStyle === "sneaker" && (
        <mesh position={[0, -1.75, 0.1]} castShadow>
          <boxGeometry args={[1.02, 0.35, 1.15]} />
          <meshStandardMaterial color={look.shoe} roughness={0.6} />
        </mesh>
      )}

      {look.footStyle === "sandal" && (
        <>
          <mesh position={[0, -1.82, 0.12]} castShadow>
            <boxGeometry args={[0.98, 0.14, 1.2]} />
            <meshStandardMaterial color={look.shoe} roughness={0.7} />
          </mesh>
          <mesh position={[0, -1.68, 0.28]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[0.9, 0.1, 0.12]} />
            <meshStandardMaterial color={look.shoeAlt} roughness={0.7} />
          </mesh>
        </>
      )}

      {look.footStyle === "boot" && (
        <>
          <mesh position={[0, -1.35, 0]} castShadow>
            <boxGeometry args={[w * 1.14, 0.9, w * 1.14]} />
            <meshStandardMaterial color={look.shoe} roughness={0.4} />
          </mesh>
          <mesh position={[0, -1.82, 0.16]} castShadow>
            <boxGeometry args={[1.08, 0.28, 1.28]} />
            <meshStandardMaterial color={look.shoeAlt} roughness={0.5} />
          </mesh>
        </>
      )}

      {look.footStyle === "techsneaker" && (
        <>
          <mesh position={[0, -1.74, 0.12]} castShadow>
            <boxGeometry args={[0.94, 0.3, 1.2]} />
            <meshStandardMaterial color={look.shoe} roughness={0.5} />
          </mesh>
          <mesh position={[0, -1.9, 0.12]}>
            <boxGeometry args={[0.98, 0.1, 1.24]} />
            <meshStandardMaterial
              color={look.accent}
              emissive={look.accent}
              emissiveIntensity={0.6}
              roughness={0.4}
            />
          </mesh>
        </>
      )}
    </>
  );
}

/* ------------------------------- torso --------------------------------- */

export function CharacterTorso({ look }: { look: CharacterLook }) {
  const w = 2 * look.build;
  return (
    <>
      {/* base shirt */}
      <mesh position={[0, 2.7, 0]} castShadow>
        <boxGeometry args={[w, 1.8, 1 * look.build]} />
        <meshStandardMaterial color={look.shirt} roughness={0.8} />
      </mesh>

      {look.topStyle === "vest" && (
        <>
          {[-0.62, 0.62].map((x) => (
            <mesh key={x} position={[x, 2.66, 0.03]} castShadow>
              <boxGeometry args={[0.78, 1.9, 1.02]} />
              <meshStandardMaterial color={look.top} roughness={0.65} />
            </mesh>
          ))}
          <mesh position={[0, 2.0, 0.03]} castShadow>
            <boxGeometry args={[2.02, 0.62, 1.03]} />
            <meshStandardMaterial color={look.top} roughness={0.65} />
          </mesh>
          <mesh position={[0, 3.5, 0.03]} castShadow>
            <boxGeometry args={[2.02, 0.3, 1.03]} />
            <meshStandardMaterial color={look.top} roughness={0.65} />
          </mesh>
          {/* tie */}
          <mesh position={[0, 3.15, 0.53]} castShadow>
            <boxGeometry args={[0.26, 0.32, 0.06]} />
            <meshStandardMaterial color="#0b0d10" roughness={0.5} />
          </mesh>
          <mesh position={[0, 2.66, 0.53]} castShadow>
            <boxGeometry args={[0.22, 0.75, 0.06]} />
            <meshStandardMaterial color="#0b0d10" roughness={0.5} />
          </mesh>
          {[2.55, 2.25, 1.95].map((y) => (
            <mesh key={y} position={[0.16, y, 0.56]}>
              <boxGeometry args={[0.1, 0.1, 0.04]} />
              <meshStandardMaterial color={look.accent} roughness={0.4} />
            </mesh>
          ))}
          <mesh position={[0.66, 2.62, 0.54]} rotation={[0, 0, 0.2]}>
            <boxGeometry args={[0.34, 0.16, 0.04]} />
            <meshStandardMaterial color="#f6f7f4" roughness={0.5} />
          </mesh>
          {[-0.86, 0.86].map((x) => (
            <mesh key={x} position={[x, 3.52, 0]} castShadow>
              <boxGeometry args={[0.5, 0.16, 1.02]} />
              <meshStandardMaterial color={look.trim} roughness={0.5} />
            </mesh>
          ))}
        </>
      )}

      {look.topStyle === "apron" && (
        <>
          {/* canvas apron bib */}
          <mesh position={[0, 2.5, 0.53]} castShadow>
            <boxGeometry args={[1.35, 2.05, 0.08]} />
            <meshStandardMaterial color={look.top} roughness={0.85} />
          </mesh>
          {/* apron pocket */}
          <mesh position={[0, 2.05, 0.6]}>
            <boxGeometry args={[1.0, 0.5, 0.06]} />
            <meshStandardMaterial color={look.trim} roughness={0.8} />
          </mesh>
          {/* neck straps */}
          {[-0.5, 0.5].map((x) => (
            <mesh key={x} position={[x, 3.45, 0.35]} rotation={[0, 0, x * 0.25]} castShadow>
              <boxGeometry args={[0.12, 0.6, 0.1]} />
              <meshStandardMaterial color={look.trim} roughness={0.8} />
            </mesh>
          ))}
          {/* shoulder skin (tank top) */}
          {[-0.82, 0.82].map((x) => (
            <mesh key={x} position={[x, 3.35, 0]} castShadow>
              <boxGeometry args={[0.42, 0.6, 0.96]} />
              <meshStandardMaterial color={look.skin} roughness={0.75} />
            </mesh>
          ))}
        </>
      )}

      {look.topStyle === "sweater" && (
        <>
          {/* thick wool over-layer */}
          <mesh position={[0, 2.7, 0]} castShadow>
            <boxGeometry args={[w * 1.06, 1.95, 1.12 * look.build]} />
            <meshStandardMaterial color={look.top} roughness={0.95} />
          </mesh>
          {/* knit stripes */}
          {[2.15, 2.55, 2.95, 3.35].map((y) => (
            <mesh key={y} position={[0, y, 0.03]}>
              <boxGeometry args={[w * 1.08, 0.14, 1.14 * look.build]} />
              <meshStandardMaterial color={look.trim} roughness={0.95} />
            </mesh>
          ))}
          {/* rolled collar */}
          <mesh position={[0, 3.72, 0]} castShadow>
            <boxGeometry args={[1.15, 0.4, 1.15]} />
            <meshStandardMaterial color={look.top} roughness={0.95} />
          </mesh>
        </>
      )}

      {look.topStyle === "jacket" && (
        <>
          <mesh position={[0, 2.7, 0.02]} castShadow>
            <boxGeometry args={[w * 1.04, 1.85, 1.08 * look.build]} />
            <meshStandardMaterial color={look.top} roughness={0.55} />
          </mesh>
          {/* neon chest stripes */}
          {[3.0, 2.55].map((y) => (
            <mesh key={y} position={[0, y, 0.58]}>
              <boxGeometry args={[w * 0.9, 0.1, 0.05]} />
              <meshStandardMaterial
                color={look.accent}
                emissive={look.accent}
                emissiveIntensity={0.6}
                roughness={0.4}
              />
            </mesh>
          ))}
          {/* zip */}
          <mesh position={[0, 2.7, 0.6]}>
            <boxGeometry args={[0.08, 1.8, 0.04]} />
            <meshStandardMaterial color={look.trim} roughness={0.4} />
          </mesh>
          {/* small dive pack on the back */}
          <mesh position={[0, 2.85, -0.72]} castShadow>
            <boxGeometry args={[1.1, 1.2, 0.42]} />
            <meshStandardMaterial color={look.shirt} roughness={0.6} />
          </mesh>
          <mesh position={[0, 2.85, -0.96]}>
            <boxGeometry args={[0.28, 0.9, 0.06]} />
            <meshStandardMaterial
              color={look.accent}
              emissive={look.accent}
              emissiveIntensity={0.5}
            />
          </mesh>
        </>
      )}
    </>
  );
}

/* -------------------------------- head --------------------------------- */

export function CharacterHead({ look }: { look: CharacterLook }) {
  return (
    <>
      <mesh castShadow>
        <boxGeometry args={[1.25, 1.25, 1.25]} />
        <meshStandardMaterial color={look.skin} roughness={0.75} />
      </mesh>

      {/* eyes */}
      {[-0.3, 0.3].map((x) => (
        <mesh
          key={x}
          position={[x, look.faceStyle === "stern" ? 0.14 : 0.12, 0.64]}
          rotation={[0, 0, look.faceStyle === "stern" ? x * 0.35 : 0]}
        >
          <boxGeometry args={[0.18, look.faceStyle === "smile" ? 0.2 : 0.24, 0.04]} />
          <meshStandardMaterial color="#1a1d22" />
        </mesh>
      ))}

      {/* mouth */}
      {look.faceStyle === "smile" ? (
        <>
          <mesh position={[0, -0.24, 0.64]}>
            <boxGeometry args={[0.42, 0.09, 0.04]} />
            <meshStandardMaterial color="#8a3a3a" />
          </mesh>
          <mesh position={[0.32, -0.08, 0.64]}>
            <boxGeometry args={[0.07, 0.07, 0.03]} />
            <meshStandardMaterial color="#7a4a32" />
          </mesh>
        </>
      ) : (
        <mesh position={[0, -0.22, 0.64]}>
          <boxGeometry args={[0.5, 0.1, 0.04]} />
          <meshStandardMaterial color="#1a1d22" />
        </mesh>
      )}

      {look.faceStyle === "bearded" && (
        <>
          {/* full beard wrapping the jaw */}
          <mesh position={[0, -0.42, 0.24]} castShadow>
            <boxGeometry args={[1.28, 0.55, 1.0]} />
            <meshStandardMaterial color={look.hair} roughness={0.9} />
          </mesh>
          {[-0.62, 0.62].map((x) => (
            <mesh key={x} position={[x, -0.05, 0.12]} castShadow>
              <boxGeometry args={[0.08, 0.62, 0.9]} />
              <meshStandardMaterial color={look.hair} roughness={0.9} />
            </mesh>
          ))}
          {/* rosy cheeks */}
          {[-0.42, 0.42].map((x) => (
            <mesh key={x} position={[x, -0.08, 0.63]}>
              <boxGeometry args={[0.24, 0.16, 0.03]} />
              <meshStandardMaterial color="#e08a7a" roughness={0.8} />
            </mesh>
          ))}
        </>
      )}

      {/* ---------------------------- hair ---------------------------- */}
      {look.hairStyle === "spiky" && (
        <>
          <mesh position={[0, 0.66, 0]} castShadow>
            <boxGeometry args={[1.34, 0.42, 1.34]} />
            <meshStandardMaterial color={look.hair} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.2, -0.68]} castShadow>
            <boxGeometry args={[1.34, 1.1, 0.14]} />
            <meshStandardMaterial color={look.hair} roughness={0.6} />
          </mesh>
          {[-0.42, -0.14, 0.14, 0.42].map((x, i) => (
            <mesh
              key={x}
              position={[x, 0.92 + (i % 2) * 0.1, 0.12 - (i % 2) * 0.2]}
              rotation={[0.2, 0, x * 0.4]}
              castShadow
            >
              <boxGeometry args={[0.24, 0.36, 0.3]} />
              <meshStandardMaterial color={look.hair} roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 0.5, 0.6]} rotation={[0.18, 0, 0]} castShadow>
            <boxGeometry args={[1.3, 0.34, 0.28]} />
            <meshStandardMaterial color={look.hair} roughness={0.6} />
          </mesh>
        </>
      )}

      {look.hairStyle === "ponytail" && (
        <>
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[1.32, 0.34, 1.32]} />
            <meshStandardMaterial color={look.hair} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.24, -0.66]} castShadow>
            <boxGeometry args={[1.3, 1.0, 0.2]} />
            <meshStandardMaterial color={look.hair} roughness={0.55} />
          </mesh>
          {/* long tail down the back */}
          <mesh position={[0, -0.45, -0.78]} rotation={[0.12, 0, 0]} castShadow>
            <boxGeometry args={[0.52, 1.8, 0.36]} />
            <meshStandardMaterial color={look.hair} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.3, -0.8]}>
            <boxGeometry args={[0.6, 0.16, 0.34]} />
            <meshStandardMaterial color={look.accent} roughness={0.6} />
          </mesh>
          {/* side bangs */}
          {[-0.58, 0.58].map((x) => (
            <mesh key={x} position={[x, 0.32, 0.4]} castShadow>
              <boxGeometry args={[0.2, 0.72, 0.5]} />
              <meshStandardMaterial color={look.hair} roughness={0.55} />
            </mesh>
          ))}
        </>
      )}

      {look.hairStyle === "shaggy" && (
        <>
          <mesh position={[0, 0.52, 0]} castShadow>
            <boxGeometry args={[1.38, 0.28, 1.38]} />
            <meshStandardMaterial color={look.hair} roughness={0.9} />
          </mesh>
          {[-0.66, 0.66].map((x) => (
            <mesh key={x} position={[x, 0.05, 0]} castShadow>
              <boxGeometry args={[0.14, 0.9, 1.3]} />
              <meshStandardMaterial color={look.hair} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 0.1, -0.68]} castShadow>
            <boxGeometry args={[1.34, 1.1, 0.2]} />
            <meshStandardMaterial color={look.hair} roughness={0.9} />
          </mesh>
        </>
      )}

      {look.hairStyle === "undercut" && (
        <>
          {/* shaved sides + tall top block */}
          <mesh position={[0, 0.5, -0.02]} castShadow>
            <boxGeometry args={[1.1, 0.42, 1.16]} />
            <meshStandardMaterial color={look.hair} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.42, 0.6]} rotation={[0.3, 0, 0]} castShadow>
            <boxGeometry args={[1.14, 0.24, 0.42]} />
            <meshStandardMaterial color={look.hair} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.18, -0.66]} castShadow>
            <boxGeometry args={[1.16, 0.7, 0.14]} />
            <meshStandardMaterial color={look.hair} roughness={0.5} />
          </mesh>
        </>
      )}

      {/* -------------------------- headwear -------------------------- */}
      {look.headwear === "headphones" && (
        <>
          {[-0.74, 0.74].map((x) => (
            <mesh key={x} position={[x, 0.05, 0]} castShadow>
              <boxGeometry args={[0.22, 0.62, 0.62]} />
              <meshStandardMaterial color={look.trim} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 0.74, 0]} castShadow>
            <torusGeometry args={[0.74, 0.07, 8, 16, Math.PI]} />
            <meshStandardMaterial color={look.trim} roughness={0.5} />
          </mesh>
        </>
      )}

      {look.headwear === "strawhat" && (
        <>
          <mesh position={[0, 0.86, 0]} castShadow>
            <cylinderGeometry args={[1.55, 1.62, 0.1, 10]} />
            <meshStandardMaterial color="#e3bf72" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.05, 0]} castShadow>
            <cylinderGeometry args={[0.72, 0.82, 0.42, 10]} />
            <meshStandardMaterial color="#d9b163" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.94, 0]}>
            <cylinderGeometry args={[0.84, 0.84, 0.14, 10]} />
            <meshStandardMaterial color={look.accent} roughness={0.7} />
          </mesh>
          {/* goggles pushed up on the forehead */}
          <mesh position={[0, 0.4, 0.5]} castShadow>
            <boxGeometry args={[1.1, 0.24, 0.36]} />
            <meshStandardMaterial color="#2b3138" roughness={0.5} />
          </mesh>
          {[-0.26, 0.26].map((x) => (
            <mesh key={x} position={[x, 0.4, 0.7]}>
              <boxGeometry args={[0.36, 0.2, 0.04]} />
              <meshStandardMaterial color="#9fdcea" roughness={0.2} metalness={0.3} />
            </mesh>
          ))}
        </>
      )}

      {look.headwear === "beanie" && (
        <>
          <mesh position={[0, 0.66, 0]} castShadow>
            <boxGeometry args={[1.42, 0.62, 1.42]} />
            <meshStandardMaterial color={look.accent} roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.36, 0]} castShadow>
            <boxGeometry args={[1.46, 0.24, 1.46]} />
            <meshStandardMaterial color={look.top} roughness={0.95} />
          </mesh>
          <mesh position={[0, 1.06, 0]} castShadow>
            <boxGeometry args={[0.34, 0.3, 0.34]} />
            <meshStandardMaterial color={look.top} roughness={0.95} />
          </mesh>
          {/* safety glasses */}
          <mesh position={[0, 0.12, 0.66]}>
            <boxGeometry args={[1.24, 0.26, 0.08]} />
            <meshStandardMaterial color="#f2f4f6" transparent opacity={0.55} roughness={0.2} />
          </mesh>
        </>
      )}

      {look.headwear === "headband" && (
        <>
          <mesh position={[0, 0.3, 0.02]} castShadow>
            <boxGeometry args={[1.32, 0.22, 1.32]} />
            <meshStandardMaterial
              color={look.accent}
              emissive={look.accent}
              emissiveIntensity={0.35}
              roughness={0.5}
            />
          </mesh>
          {/* neck gaiter / mask */}
          <mesh position={[0, -0.5, 0.1]} castShadow>
            <boxGeometry args={[1.22, 0.5, 1.16]} />
            <meshStandardMaterial color={look.shirt} roughness={0.7} />
          </mesh>
        </>
      )}
    </>
  );
}

/* -------------------------------- arms --------------------------------- */

export function CharacterArm({ look }: { look: CharacterLook }) {
  const w = 0.92 * look.build;
  const bare = look.topStyle === "apron";
  return (
    <>
      <mesh position={[0, -0.5, 0]} castShadow>
        <boxGeometry args={[w, 1.1, w]} />
        <meshStandardMaterial color={bare ? look.skin : look.sleeve} roughness={0.7} />
      </mesh>
      <mesh position={[0, -1.16, 0]} castShadow>
        <boxGeometry args={[w * 1.04, 0.34, w * 1.04]} />
        <meshStandardMaterial color={bare ? look.accent : look.cuff} roughness={0.6} />
      </mesh>
      <mesh position={[0, -1.58, 0]} castShadow>
        <boxGeometry args={[w * 0.98, 0.55, w * 0.98]} />
        <meshStandardMaterial color={look.skin} roughness={0.75} />
      </mesh>
      {look.topStyle === "jacket" && (
        <mesh position={[0, -0.5, w * 0.52]}>
          <boxGeometry args={[w * 0.6, 0.08, 0.04]} />
          <meshStandardMaterial
            color={look.accent}
            emissive={look.accent}
            emissiveIntensity={0.6}
          />
        </mesh>
      )}
    </>
  );
}

/* ---------------------- standalone preview avatar ---------------------- */

/**
 * Static standing pose of a preset, used by the character-select cards. It
 * mirrors the rig's rest positions but owns no refs and runs no animation.
 */
export function CharacterPreview({ id }: { id: string }) {
  const look = characterLook(id);
  return (
    <group>
      {[-0.52, 0.52].map((x) => (
        <group key={x} position={[x, 1.8, 0]}>
          <CharacterLegs look={look} side={x < 0 ? -1 : 1} />
        </group>
      ))}
      <CharacterTorso look={look} />
      <group position={[0, 4.25, 0]}>
        <CharacterHead look={look} />
      </group>
      <group position={[1.5, 3.5, 0]} rotation={[0, 0, -0.12]}>
        <CharacterArm look={look} />
      </group>
      <group position={[-1.5, 3.5, 0]} rotation={[0, 0, 0.12]}>
        <CharacterArm look={look} />
      </group>
    </group>
  );
}
