/**
 * lib/analytics/player-profiles.ts
 *
 * Base de conocimiento táctico del circuito ATP.
 * Perfiles construidos con conocimiento de scout de élite: armas, debilidades,
 * patrones de juego, comportamiento bajo presión y adaptabilidad táctica.
 */

export type StyleType =
  | "aggressive-baseliner"
  | "counter-puncher"
  | "big-server"
  | "all-court"
  | "serve-and-volley"
  | "defensive-baseliner";

export type PressureType = "elevates" | "consistent" | "inconsistent" | "declines";
export type FlexType = "high" | "medium" | "low";

export interface TacticalProfile {
  slug: string;
  name: string;
  // Armas
  weapon: string;
  weapon2?: string;
  // Debilidades explotables
  weakness: string;
  weakness2?: string;
  // Estilo y patrones
  style: StyleType;
  patterns: string[];         // patrones tácticos clave
  // Idoneidad por superficie (1-10)
  clay: number;
  hard: number;
  grass: number;
  // Habilidades (1-10)
  serving: number;
  returning: number;
  netGame: number;
  speed: number;
  fitness: number;
  // Mentalidad
  pressure: PressureType;
  clutch: number;             // 1-10 en puntos decisivos
  comeback: number;           // 1-10 capacidad de remontar
  // Adaptabilidad táctica
  flexibility: FlexType;
  // Textos de análisis
  tacticalNote: string;
  mentalNote: string;
  // Ventajas de sede
  homeVenues?: string[];
}

// ── Base de datos de perfiles ─────────────────────────────

const PROFILES: TacticalProfile[] = [

  // ═══════════════ TOP 5 ═══════════════════════════════════

  {
    slug: "sinner",
    name: "Jannik Sinner",
    weapon: "revés cruzado y por línea — el más aplastante del circuito actualmente",
    weapon2: "primer servicio plano al T con gran colocación",
    weakness: "bolas muy topadas al revés que le sacan lejos de la pista",
    style: "aggressive-baseliner",
    patterns: ["backhand DTL pressure", "serve-T + forehand inside-in", "backhand CC + open DTL"],
    clay: 9, hard: 10, grass: 8,
    serving: 8, returning: 9, netGame: 7, speed: 9, fitness: 10,
    pressure: "elevates", clutch: 10, comeback: 9,
    flexibility: "high",
    tacticalNote: "Sinner controla el punto desde el centro de la pista — su revés cruzado obliga al rival a contestar fuera de posición, y en ese momento abre el ángulo con el derecho inside-in. Es el jugador que menos errores no forzados comete entre los top-5.",
    mentalNote: "Mentalidad de acero. Remontar sets y situaciones difíciles es su patrón — lo hace sin cambiar el plan de juego, simplemente intensificando la ejecución.",
  },
  {
    slug: "alcaraz",
    name: "Carlos Alcaraz",
    weapon: "forehand topspineado pesado — genera botes muy altos al revés del rival en arcilla",
    weapon2: "drop shot inesperado + subida a la red — combina lo que ningún otro hace",
    weakness: "puede ir a por demasiado en momentos límite — dobles faltas bajo presión extrema",
    weakness2: "rivales que juegan muy plano y rápido eliminan su ventaja de tiempo",
    style: "all-court",
    patterns: ["inside-out forehand to backhand", "drop shot + lob counter", "serve wide + forehand winner", "net rush from mid-court"],
    clay: 10, hard: 9, grass: 9,
    serving: 8, returning: 9, netGame: 9, speed: 10, fitness: 10,
    pressure: "elevates", clutch: 9, comeback: 9,
    flexibility: "high",
    tacticalNote: "El jugador más completo del circuito. Su forehand topspineado en arcilla genera botes por encima del hombro de cualquier rival. La clave de su juego es la imprevisibilidad: el rival nunca sabe si viene el drop shot, la subida a la red o el peloteo desde el fondo.",
    mentalNote: "Competitividad máxima. Su inmadurez ocasional (dobles faltas, exceso de ambición en puntos clave) es compensada por su reacción positiva a la adversidad. Cuando está 'against the ropes', suele elevar.",
    homeVenues: ["madrid", "barcelona"],
  },
  {
    slug: "zverev",
    name: "Alexander Zverev",
    weapon: "saque (primer servicio plano 220+ km/h; kick explosivo como segundo)",
    weapon2: "forehand inside-out desde la esquina de ventaja",
    weakness: "bolas al cuerpo en momentos de presión; segundo servicio atacable",
    weakness2: "volea — su red es el punto más débil cuando sube",
    style: "big-server",
    patterns: ["serve-T + forehand inside-in", "serve wide deuce + forehand CC", "baseline rally center"],
    clay: 8, hard: 9, grass: 7,
    serving: 10, returning: 7, netGame: 5, speed: 7, fitness: 8,
    pressure: "inconsistent", clutch: 6, comeback: 6,
    flexibility: "medium",
    tacticalNote: "El saque de Zverev nivela cualquier partido — con el primer servicio en juego, su dominancia es total. El problema emerge cuando se rompe el servicio y debe construir el punto desde el peloteo sin un arma de terminar alternativa clara.",
    mentalNote: "El historial en finales de GS es su talón de Aquiles. Mejorado en los últimos años, pero la duda persiste en el último punto del partido más importante.",
  },
  {
    slug: "djokovic",
    name: "Novak Djokovic",
    weapon: "return of serve — el mejor de la historia; convierte defensa en ataque en una fracción",
    weapon2: "revés cruzado por línea desde la esquina + defensa atlética imposible",
    weakness: "físicamente, a los 37-38 años, más vulnerable en los sets 4-5 contra jugadores muy físicos",
    style: "counter-puncher",
    patterns: ["return + backhand DTL", "defensive retrieval + forehand winner", "serve + return exchange control"],
    clay: 9, hard: 10, grass: 10,
    serving: 9, returning: 10, netGame: 8, speed: 9, fitness: 10,
    pressure: "elevates", clutch: 10, comeback: 10,
    flexibility: "high",
    tacticalNote: "El jugador más completo de la historia del tenis. Su return es un arma ofensiva — devuelve saques de 210+ km/h con profundidad y dirección. Su backhand DTL desde la esquina más cerrada es uno de los mejores golpes de la historia. Desde posiciones defensivas imposibles, genera winners.",
    mentalNote: "La mente más fuerte del tenis de todos los tiempos. Remontar situaciones límite es su norma — US Open 2016, Wimbledon 2019, Australian Open 2023. La edad es su único rival real.",
  },
  {
    slug: "medvedev",
    name: "Daniil Medvedev",
    weapon: "return devastador + revés plano cruzado (el más pesado y preciso del circuito)",
    weapon2: "pases paralelos desde posiciones abiertas — ángulos imposibles",
    weakness: "arcilla — el bote más alto reduce el ángulo de ataque de su juego plano",
    weakness2: "ligera rigidez táctica cuando el rival elimina sus ángulos cruzados",
    style: "aggressive-baseliner",
    patterns: ["return flat + backhand CC pressure", "wide serve + forehand inside-in", "lob defense + DTL counter"],
    clay: 6, hard: 10, grass: 8,
    serving: 8, returning: 10, netGame: 6, speed: 8, fitness: 9,
    pressure: "consistent", clutch: 9, comeback: 8,
    flexibility: "medium",
    tacticalNote: "Medvedev domina el peloteo plano y rápido — sus golpes no tienen el arco de Sinner o Alcaraz, pero sí velocidad y profundidad excepcionales. Su return es el mejor actualmente después de Djokovic. En pista dura, su juego es más difícil de neutralizar que el de casi cualquier rival.",
    mentalNote: "Mentalmente sólido con algún brote emocional visible (conocido por sus discusiones en pista). La victoria en el US Open 2021 — remontando 2 sets a Djokovic — es su mayor demostración de fortaleza mental.",
  },

  // ═══════════════ TOP 6-20 ════════════════════════════════

  {
    slug: "rublev",
    name: "Andrey Rublev",
    weapon: "forehand plano explosivo (uno de los más rápidos del circuito, 150+ km/h)",
    weapon2: "físico y resistencia — aguanta peloteos largos",
    weakness: "presión mental en los momentos más importantes — tendencia a irse de la pista en puntos clave",
    weakness2: "juego de red y voleas",
    style: "aggressive-baseliner",
    patterns: ["forehand CC inside-out", "serve + forehand winner", "forehand CC to open DTL"],
    clay: 8, hard: 9, grass: 7,
    serving: 7, returning: 8, netGame: 5, speed: 8, fitness: 9,
    pressure: "declines", clutch: 5, comeback: 5,
    flexibility: "low",
    tacticalNote: "Cuando Rublev juega automático — sin pensar demasiado — es imparable. Su forehand genera la velocidad de pelota más alta del circuito. El problema: en momentos de tensión piensa los golpes en lugar de ejecutarlos, lo que reduce agresividad y aumenta errores.",
    mentalNote: "El talón de Aquiles de su carrera. Ha perdido partidos que tenía ganados en puntos límite. Es consciente del problema pero el patrón se repite sistemáticamente.",
  },
  {
    slug: "hurkacz",
    name: "Hubert Hurkacz",
    weapon: "servicio (excelente wide al cuadro de ventaja + kick explosivo)",
    weapon2: "volea y juego de red — el mejor serve-and-volley del circuito actual",
    weakness: "arcilla — el bote bajo anula su ventaja de saque y su red",
    weakness2: "peloteos largos cuando el rival neutraliza el saque",
    style: "serve-and-volley",
    patterns: ["serve wide ad + volley", "serve T + forehand", "approach shot + net approach"],
    clay: 5, hard: 8, grass: 9,
    serving: 9, returning: 7, netGame: 9, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 6, comeback: 5,
    flexibility: "medium",
    tacticalNote: "En hierba y pista dura rápida, el saque de Hurkacz combinado con su red es devastador. En arcilla pierde esa ventaja y depende de un juego de fondo que no es su punto fuerte.",
    mentalNote: "Inconsistente — tiene días brillantes (Wimbledon 2021 SF donde arrasó a Federer 6-0 en el tercero) y otros donde parece un jugador diferente. La regularidad mental es lo que le separa del top-5.",
  },
  {
    slug: "minaur",
    name: "Alex de Minaur",
    weapon: "velocidad — el jugador más rápido del circuito; recupera bolas imposibles",
    weapon2: "slice de revés defensivo/ofensivo y anticipación",
    weakness: "jugadores que generan mucho topspin alto a su forehand — le saca de posición",
    weakness2: "cuando el rival absorbe su velocidad y genera potencia, De Minaur no tiene winner fácil",
    style: "counter-puncher",
    patterns: ["wide return + running forehand", "slice backhand + counter", "drop shot defense + lob"],
    clay: 7, hard: 8, grass: 8,
    serving: 7, returning: 9, netGame: 7, speed: 10, fitness: 10,
    pressure: "consistent", clutch: 7, comeback: 7,
    flexibility: "medium",
    tacticalNote: "De Minaur es el especialista defensivo del circuito — recupera lo que cualquier otro habría dado por perdido. Su estrategia: aguantar hasta que el rival se desgaste buscando el winner. El límite de su juego está en que sin un arma ofensiva real, los top-5 lo controlan más tiempo del que quisiera.",
    mentalNote: "Muy profesional y consistente mentalmente. Su problema no es mental sino táctico — le falta el arma de decisión cuando el rival lo neutraliza.",
  },
  {
    slug: "fritz",
    name: "Taylor Fritz",
    weapon: "saque (primer servicio plano 220+ km/h, colocación excelente)",
    weapon2: "forehand inside-out desde la posición de ventaja",
    weakness: "partidos físicos de larga duración — tiende a perder nivel en el 3er set",
    weakness2: "arcilla y jugadores que le obligan a muchas pelotas altas al revés",
    style: "big-server",
    patterns: ["serve + forehand", "serve wide deuce + forehand CC", "baseline rally center"],
    clay: 6, hard: 9, grass: 8,
    serving: 9, returning: 7, netGame: 7, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 6, comeback: 6,
    flexibility: "medium",
    tacticalNote: "El mejor americano del circuito actualmente. Su saque le da una ventaja inicial en casi cualquier partido de pista rápida. Cuando el rival supera esa ventaja y convierte el partido en batalla física, Fritz tiende a perder nivel.",
    mentalNote: "Ha mejorado en grandes torneos pero todavía inconsistente en los momentos más decisivos. Su Davis Cup ha mostrado su lado más competitivo.",
  },
  {
    slug: "musetti",
    name: "Lorenzo Musetti",
    weapon: "drop shot y slice creativo — entre los más imprevisibles del circuito",
    weapon2: "revés a una mano con ángulos únicos (topspin y slice)",
    weakness: "inconsistencia de nivel — puede jugar brillante o desaparecer en el mismo partido",
    weakness2: "jugadores que juegan muy plano y rápido, que eliminan su espacio para crear",
    style: "all-court",
    patterns: ["slice approach + net", "drop shot + lob", "backhand slice CC + DTL winner"],
    clay: 9, hard: 7, grass: 8,
    serving: 7, returning: 7, netGame: 8, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 6, comeback: 6,
    flexibility: "high",
    tacticalNote: "El jugador más artístico del circuito actual. Su variedad táctica es excepcional — drop shots impredecibles, slices con ángulo, subidas a la red sorpresivas. En un buen día, desorienta a cualquier rival. La regularidad de ese nivel es su asignatura pendiente.",
    mentalNote: "Talentosísimo pero todavía irregular en los grandes torneos. Su Wimbledon 2024 SF mostró que puede sostener el nivel en situaciones de alta presión durante una semana entera.",
    homeVenues: ["rome", "florence"],
  },
  {
    slug: "tsitsipas",
    name: "Stefanos Tsitsipas",
    weapon: "revés a una mano — el mejor del circuito actual; ángulos con slice imposibles",
    weapon2: "subida a la red + volea — la combinación slice + net más efectiva del circuito",
    weakness: "revés puede bloquearse bajo presión extrema en los momentos más importantes",
    weakness2: "segundo servicio — atacado con frecuencia por grandes returnadores",
    style: "all-court",
    patterns: ["backhand slice approach + volley", "forehand CC + net approach", "serve + backhand DTL"],
    clay: 9, hard: 8, grass: 7,
    serving: 8, returning: 7, netGame: 9, speed: 7, fitness: 8,
    pressure: "inconsistent", clutch: 6, comeback: 6,
    flexibility: "high",
    tacticalNote: "El revés a una mano de Tsitsipas es único — los ángulos que consigue son imposibles para un bimano. Su combinación de slice de revés + subida a la red es la más elegante del circuito. El problema: los momentos de máxima presión no siempre sacan lo mejor de él.",
    mentalNote: "Ha perdido finales de GS que tenía prácticamente ganadas (RG 2021 desde +2-0 en sets contra Djokovic). La gestión de los momentos límite es su principal deuda pendiente.",
    homeVenues: ["monte-carlo", "rome"],
  },
  {
    slug: "paul",
    name: "Tommy Paul",
    weapon: "forehand agresivo y plano desde la esquina de deuce",
    weapon2: "return muy agresivo — ataca el segundo servicio con frecuencia inusual",
    weakness: "arcilla y partidos físicos de más de 2 horas",
    weakness2: "saques de 210+ km/h que le sacan del ritmo de return",
    style: "aggressive-baseliner",
    patterns: ["return attack + forehand", "forehand inside-out CC", "serve + forehand"],
    clay: 6, hard: 8, grass: 7,
    serving: 7, returning: 8, netGame: 6, speed: 8, fitness: 7,
    pressure: "consistent", clutch: 7, comeback: 7,
    flexibility: "medium",
    tacticalNote: "Paul es el americano más completo en peloteo del circuito actual — superior a Fritz en ese aspecto, aunque inferior en saque. Su return agresivo es su característica definitoria: ataca el segundo servicio antes de que el rival establezca el punto.",
    mentalNote: "Profesional y consistente — sin grandes altibajos. No eleva en las grandes ocasiones pero tampoco cae.",
  },
  {
    slug: "shelton",
    name: "Ben Shelton",
    weapon: "saque zurdo — ángulo wide al cuadro deuce que no existe para un diestro",
    weapon2: "forehand explosivo desde la zurda con potencia excepcional",
    weakness: "arcilla y peloteos largos — madurez táctica en construcción en partidos de 3 horas",
    weakness2: "jugadores que eliminan su saque y le obligan a construir desde el fondo",
    style: "big-server",
    patterns: ["serve wide deuce + forehand", "serve T ad + forehand inside-in", "aggressive return forehand"],
    clay: 5, hard: 8, grass: 8,
    serving: 10, returning: 7, netGame: 6, speed: 8, fitness: 8,
    pressure: "inconsistent", clutch: 6, comeback: 6,
    flexibility: "medium",
    tacticalNote: "El saque zurdo de Shelton genera un ángulo al wide del cuadro deuce que ningún diestro puede reproducir — el tiro va alejándose del cuerpo del rival en lugar de acercarse. En pista rápida con ese saque, es capaz de batir a cualquiera.",
    mentalNote: "Joven (22 años) con explosividad y competitividad. Irregular todavía pero con potencial para ser top-10 sostenido.",
  },
  {
    slug: "rune",
    name: "Holger Rune",
    weapon: "forehand potente con ángulo interior + return muy agresivo",
    weapon2: "backhand sólido, especialmente cruzado",
    weakness: "jugadores que le atacan la segunda bola de servicio y le sacan del ritmo",
    weakness2: "juego de red — no es su punto fuerte",
    style: "aggressive-baseliner",
    patterns: ["return + forehand inside-out", "rally forehand CC + DTL", "serve + baseline exchange"],
    clay: 8, hard: 8, grass: 7,
    serving: 7, returning: 8, netGame: 6, speed: 8, fitness: 8,
    pressure: "consistent", clutch: 7, comeback: 7,
    flexibility: "medium",
    tacticalNote: "Rune no tiene una sola arma dominante sino un juego completo para su edad — return, baseline, físico. Su mayor fortaleza es competitiva: juega igual de bien al inicio del torneo que en la final.",
    mentalNote: "Maduro mentalmente para los 21 años. Aprende rápido de los errores tácticos. No se desmorona en los momentos difíciles.",
  },
  {
    slug: "dimitrov",
    name: "Grigor Dimitrov",
    weapon: "forehand elegante con gran aceleración al contacto",
    weapon2: "subidas a la red y voleas — el jugador de fondo que mejor completa los puntos en la red",
    weakness: "inconsistencia de nivel — desaparece en períodos inexplicables",
    weakness2: "jugadores que le toman el tiempo y le impiden cargar el golpe",
    style: "all-court",
    patterns: ["forehand + approach shot", "serve + volley", "drop shot + net rush"],
    clay: 7, hard: 8, grass: 8,
    serving: 8, returning: 7, netGame: 9, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 6, comeback: 6,
    flexibility: "high",
    tacticalNote: "El más parecido a Federer del circuito actual — variedad, elegancia y capacidad de jugar a cualquier ritmo. Cuando está al 100%, su juego completo es un problema para cualquier rival. El talón de Aquiles es la irregularidad de ese 100%.",
    mentalNote: "Buenas semifinales, pocas finales ganadoras. Su talento no siempre está acompañado por la intensidad competitiva que los mejores mantienen.",
  },
  {
    slug: "draper",
    name: "Jack Draper",
    weapon: "saque zurdo — gran colocación y ángulo único, especialmente al wide del cuadro deuce",
    weapon2: "forehand potente desde la zurda",
    weakness: "lesiones frecuentes que interrumpen su consolidación en el tour",
    weakness2: "arcilla — todavía en desarrollo en esta superficie",
    style: "aggressive-baseliner",
    patterns: ["serve wide + forehand", "aggressive return forehand", "baseline rally forehand"],
    clay: 6, hard: 8, grass: 8,
    serving: 9, returning: 7, netGame: 6, speed: 8, fitness: 6,
    pressure: "consistent", clutch: 7, comeback: 7,
    flexibility: "medium",
    tacticalNote: "El zurdo más prometedor del circuito junto a Shelton. Su saque genera ángulos únicos y su forehand tiene potencia máxima. La diferencia con Shelton: Draper tiene más variedad táctica y mejor slice de revés. Las lesiones son su mayor obstáculo.",
    mentalNote: "Sólido mentalmente para su edad. Cuando está sano, su nivel es consistentemente top-15.",
  },
  {
    slug: "khachanov",
    name: "Karen Khachanov",
    weapon: "forehand muy plano y potente — devastating en días buenos",
    weapon2: "saque grande",
    weakness: "inconsistencia extrema — puede perder con cualquier top-50 en un mal día",
    weakness2: "jugadores que atacan su segunda bola de servicio",
    style: "aggressive-baseliner",
    patterns: ["serve + forehand inside-out", "forehand CC + DTL", "rally forehand center"],
    clay: 7, hard: 8, grass: 7,
    serving: 8, returning: 7, netGame: 6, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 6, comeback: 5,
    flexibility: "low",
    tacticalNote: "El jugador de resultados más dispersos del circuito — puede batir a Djokovic en un GS y perder con un jugador top-80 en el mismo torneo. Su forehand plano, cuando está activado, es uno de los más pesados del tour.",
    mentalNote: "La inconsistencia es su marca. No hay patrón claro de cuándo 'aparece'. Los factores externos (físico, estado mental) parecen determinar su nivel más que cualquier estrategia.",
  },
  {
    slug: "berrettini",
    name: "Matteo Berrettini",
    weapon: "saque potente — primer servicio flat 220+ km/h con gran colocación",
    weapon2: "forehand inside-out desde el cuadro de deuce cuando el saque abre el punto",
    weakness: "lesiones que han interrumpido su carrera múltiples veces",
    weakness2: "arcilla — pelotas bajas y peloteos largos no son su juego",
    style: "big-server",
    patterns: ["serve + forehand", "serve wide deuce + forehand inside-out", "serve T ad + forehand inside-in"],
    clay: 6, hard: 9, grass: 9,
    serving: 10, returning: 6, netGame: 7, speed: 7, fitness: 6,
    pressure: "consistent", clutch: 8, comeback: 7,
    flexibility: "low",
    tacticalNote: "Cuando Berrettini está sano, tiene el mejor saque del circuito por combinación de potencia y colocación. En Wimbledon 2021 demostró que ese saque le hace casi imbatible en hierba.",
    mentalNote: "Sólido en los grandes momentos cuando está al 100% físicamente. Las lesiones son su principal enemigo.",
  },
  {
    slug: "korda",
    name: "Sebastian Korda",
    weapon: "saque potente + forehand agresivo",
    weapon2: "atletismo — uno de los americanos más rápidos",
    weakness: "lesiones frecuentes que interrumpen su progresión",
    weakness2: "arcilla y peloteos largos",
    style: "aggressive-baseliner",
    patterns: ["serve + forehand", "return + baseline rally", "forehand inside-out"],
    clay: 6, hard: 8, grass: 7,
    serving: 8, returning: 7, netGame: 6, speed: 8, fitness: 6,
    pressure: "inconsistent", clutch: 6, comeback: 6,
    flexibility: "medium",
    tacticalNote: "Gran talento americano que las lesiones han frenado sistemáticamente. Cuando está sano, su saque y forehand le hacen competitivo con cualquier top-20 en pista rápida.",
    mentalNote: "Joven, todavía desarrollando su perfil en los grandes torneos.",
  },
  {
    slug: "auger-aliassime",
    name: "Félix Auger-Aliassime",
    weapon: "saque alto (2.03m) con primer servicio potente y colocado",
    weapon2: "juego de red — mejor del circuito entre los no-veteranos",
    weakness: "arcilla — no es su superficie natural",
    weakness2: "presión en el segundo servicio",
    style: "big-server",
    patterns: ["serve + net approach", "serve + forehand winner", "serve-volley on grass"],
    clay: 6, hard: 8, grass: 8,
    serving: 9, returning: 7, netGame: 8, speed: 7, fitness: 8,
    pressure: "consistent", clutch: 7, comeback: 7,
    flexibility: "medium",
    tacticalNote: "FAA ha completado el circuito — sus victorias en torneos ATP 500 y sus Davis Cups con Canadá confirman que puede ganar a los mejores en pista rápida. Su saque y calidad de red son sus mejores armas.",
    mentalNote: "Ha pasado de jugador de potencial a jugador consolidado. Su Davis Cup demuestra que rinde bajo presión colectiva.",
  },
  {
    slug: "tiafoe",
    name: "Frances Tiafoe",
    weapon: "forehand plano explosivo — impredecible en los puntos más importantes",
    weapon2: "return muy agresivo en el segundo servicio",
    weakness: "arcilla y peloteos de más de 20 golpes sin terminar el punto",
    weakness2: "inconsistencia — puede tener sets brillantes y otros mediocres en el mismo partido",
    style: "aggressive-baseliner",
    patterns: ["return forehand attack", "forehand inside-out", "rally forehand CC + DTL"],
    clay: 5, hard: 8, grass: 7,
    serving: 7, returning: 8, netGame: 6, speed: 8, fitness: 8,
    pressure: "inconsistent", clutch: 6, comeback: 7,
    flexibility: "medium",
    tacticalNote: "Tiafoe puede ser el mejor jugador del mundo por intervalos — su energía y su return pueden desequilibrar a cualquier rival. El problema: esa energía es difícil de sostener durante un partido completo sin caídas de nivel.",
    mentalNote: "Errático — sus días buenos son memorables (derrotó a Nadal en el US Open 2022) pero sus días malos son muy malos. Su relación con el público es un activo extra.",
  },
  {
    slug: "norrie",
    name: "Cameron Norrie",
    weapon: "consistencia y resistencia — reduce errores al mínimo y espera al rival",
    weapon2: "forehand de escuela izquierda — ángulo ligeramente diferente",
    weakness: "le falta el golpe ganador — raramente termina el punto de forma directa",
    weakness2: "grandes saques que le sacan del ritmo de peloteo",
    style: "counter-puncher",
    patterns: ["rally forehand CC consistent", "return + baseline exchange", "defensive retrieval"],
    clay: 7, hard: 7, grass: 8,
    serving: 6, returning: 8, netGame: 5, speed: 8, fitness: 9,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "medium",
    tacticalNote: "Norrie gana por desgaste del rival — devuelve todo, corre todo y espera el error. No tiene un arma de golpe ganador clara, pero es muy difícil de desequilibrar.",
    mentalNote: "Profesional y sin nervios. Rinde de forma constante. Su falta de 'modo élite' en los grandes torneos es su techo.",
    homeVenues: ["queen-s-club"],
  },

  // ═══════════════ TOP 21-50 ═══════════════════════════════

  {
    slug: "humbert",
    name: "Ugo Humbert",
    weapon: "return agresivo + forehand zurdo de tiempo rápido",
    weapon2: "velocidad en el peloteo — toma el tiempo antes de lo esperado",
    weakness: "jugadores con mucho topspin que le sacan de su zona de timing",
    weakness2: "arcilla con bolas pesadas",
    style: "aggressive-baseliner",
    patterns: ["return + forehand attack", "forehand inside-out (zurdo)", "rally forehand CC fast"],
    clay: 6, hard: 8, grass: 8,
    serving: 8, returning: 8, netGame: 6, speed: 9, fitness: 8,
    pressure: "consistent", clutch: 7, comeback: 6,
    flexibility: "medium",
    tacticalNote: "Zurdo infravalorado en el circuito. Su timing de return toma el tiempo antes de lo que los rivales esperan — ataca el segundo servicio con anticipación única. En pista rápida, su ritmo de juego es difícil de gestionar para la mayoría.",
    mentalNote: "Consistente mentalmente. No se desmorona. Su desafío es elevar el nivel en los torneos más grandes.",
  },
  {
    slug: "bublik",
    name: "Alexander Bublik",
    weapon: "saque no convencional (panda, plano, kick en zonas inesperadas — máxima variedad)",
    weapon2: "subida a la red agresiva — el más atrevido en acercamientos del circuito",
    weakness: "peloteos largos desde el fondo — no es su juego natural",
    weakness2: "inconsistencia extrema — puede perder con cualquier rival",
    style: "serve-and-volley",
    patterns: ["serve + net rush", "drop shot", "unorthodox serve angles"],
    clay: 5, hard: 7, grass: 8,
    serving: 8, returning: 6, netGame: 9, speed: 7, fitness: 6,
    pressure: "inconsistent", clutch: 5, comeback: 4,
    flexibility: "high",
    tacticalNote: "El jugador más entretenido — e impredecible — del circuito. Su catálogo de servicios descoloca a cualquier rival. Pero su irregularidad táctica es un arma de doble filo: puede ser brillante espectacular o hundirse sin aviso.",
    mentalNote: "Errático. Ha abandonado partidos cuando era favorito. Su motivación es el elemento más difícil de predecir.",
  },
  {
    slug: "cerundolo",
    name: "Francisco Cerundolo",
    weapon: "forehand topspineado — genera alto bote en arcilla que desconfigura al rival",
    weapon2: "físico y resistencia en arcilla",
    weakness: "pista dura rápida — su juego de fondo pierde efecto sin bote alto",
    weakness2: "jugadores que toman el tiempo antes de que genere el bote",
    style: "counter-puncher",
    patterns: ["forehand heavy CC clay", "forehand inside-out to backhand", "baseline rally clay"],
    clay: 8, hard: 6, grass: 5,
    serving: 6, returning: 7, netGame: 5, speed: 7, fitness: 8,
    pressure: "consistent", clutch: 7, comeback: 7,
    flexibility: "low",
    tacticalNote: "Especialista en arcilla con forehand topspineado de alta calidad. En tierra, su consistencia y bote alto son su mejor arma. Fuera de la arcilla, pierde mucho de su ventaja táctica.",
    mentalNote: "Sólido mentalmente en arcilla. Fuera de ella, más inconsistente.",
  },
  {
    slug: "jarry",
    name: "Nicolás Jarry",
    weapon: "saque — 2.00m de altura genera ángulo y kick impredecible",
    weapon2: "forehand con pegada firme desde el fondo",
    weakness: "arcilla lenta — peloteos largos drenan la efectividad del saque",
    weakness2: "jugadores que atacan su segundo servicio",
    style: "big-server",
    patterns: ["serve + forehand", "serve T + baseline rally"],
    clay: 6, hard: 7, grass: 7,
    serving: 9, returning: 6, netGame: 6, speed: 6, fitness: 7,
    pressure: "inconsistent", clutch: 6, comeback: 5,
    flexibility: "low",
    tacticalNote: "Jarry ha emergido como servidor de élite en el circuito. Su altura genera ángulos de saque difíciles de leer. Fuera del saque, su juego de fondo es competente pero no excepcional.",
    mentalNote: "Ha mejorado mucho su consistencia en los últimos dos años.",
  },
  {
    slug: "struff",
    name: "Jan-Lennard Struff",
    weapon: "saque potente y eficaz en los momentos importantes",
    weapon2: "forehand directo y agresivo",
    weakness: "arcilla y peloteos de más de 10 golpes",
    style: "big-server",
    patterns: ["serve + forehand", "serve T + baseline rally"],
    clay: 6, hard: 7, grass: 7,
    serving: 8, returning: 6, netGame: 6, speed: 6, fitness: 7,
    pressure: "consistent", clutch: 7, comeback: 6,
    flexibility: "low",
    tacticalNote: "Veterano alemán que basa su juego en el saque y el forehand. Más fiable de lo que su ranking a veces sugiere — ha dado sorpresas en GS.",
    mentalNote: "Sólido en los momentos de presión.",
  },
  {
    slug: "popyrin",
    name: "Alexei Popyrin",
    weapon: "saque enorme (210+ km/h) + forehand potente (2.01m de altura)",
    weapon2: "físico intimidante",
    weakness: "inconsistencia extrema — puede ser brillante o invisible",
    weakness2: "arcilla y peloteos largos",
    style: "big-server",
    patterns: ["serve + forehand winner", "big hitting from baseline"],
    clay: 5, hard: 8, grass: 7,
    serving: 9, returning: 6, netGame: 6, speed: 6, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 4,
    flexibility: "low",
    tacticalNote: "Cuando Popyrin pega bien, ningún top-10 tiene garantías. Sus días malos son igual de probables que sus días buenos. El saque de 215+ km/h es su entrada en cualquier partido.",
    mentalNote: "Gran potencial no desarrollado consistentemente. Puede ganar títulos ATP y perder en primera ronda el torneo siguiente.",
  },
  {
    slug: "marozsan",
    name: "Fabian Marozsan",
    weapon: "forehand topspineado en arcilla — efecto máximo en tierra roja",
    weapon2: "resistencia física en peloteos largos de arcilla",
    weakness: "pista dura — fuera de su superficie pierde mucho nivel",
    weakness2: "jugadores que le toman el tiempo y eliminan el bote",
    style: "counter-puncher",
    patterns: ["forehand heavy topspin clay", "baseline exchange clay specialist"],
    clay: 8, hard: 5, grass: 4,
    serving: 5, returning: 6, netGame: 4, speed: 7, fitness: 8,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "low",
    tacticalNote: "Especialista de arcilla que sorprendió a Djokovic en el French Open 2023. Fuera de la tierra, sus resultados caen notablemente.",
    mentalNote: "Sólido en arcilla. Datos insuficientes en otras superficies.",
  },
  {
    slug: "arnaldi",
    name: "Matteo Arnaldi",
    weapon: "forehand potente y plano desde el centro de la pista",
    weapon2: "resistencia física",
    weakness: "jugadores con mucho topspin que rompen su ritmo plano",
    style: "aggressive-baseliner",
    patterns: ["forehand CC + DTL", "serve + forehand"],
    clay: 7, hard: 7, grass: 6,
    serving: 7, returning: 7, netGame: 5, speed: 7, fitness: 8,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "medium",
    tacticalNote: "Italiano sólido consolidando su sitio en el top-30. Juego de fondo consistente con buen forehand. Fiable en los momentos de presión — no se cae.",
    mentalNote: "Más fiable de lo que su ranking a veces indica.",
  },
  {
    slug: "darderi",
    name: "Luciano Darderi",
    weapon: "forehand pesado estilo arcilla (topspin con dirección)",
    weapon2: "resistencia",
    weakness: "pista rápida — jugador de tierra principalmente",
    style: "counter-puncher",
    patterns: ["forehand CC clay heavy", "baseline rally clay"],
    clay: 7, hard: 6, grass: 5,
    serving: 6, returning: 7, netGame: 5, speed: 7, fitness: 7,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "medium",
    tacticalNote: "Joven italiano en ascenso con peloteo de fondo agresivo en arcilla como arma principal.",
    mentalNote: "Competitivo y consistente para su nivel.",
  },
  {
    slug: "tabilo",
    name: "Alejandro Tabilo",
    weapon: "forehand muy plano — velocidad de pelota difícil de leer",
    weapon2: "return agresivo",
    weakness: "jugadores con gran saque que le sacan del ritmo",
    style: "aggressive-baseliner",
    patterns: ["return + forehand attack", "forehand CC flat"],
    clay: 7, hard: 8, grass: 6,
    serving: 7, returning: 8, netGame: 5, speed: 7, fitness: 7,
    pressure: "consistent", clutch: 7, comeback: 7,
    flexibility: "medium",
    tacticalNote: "Chileno que ha dado sorpresas mayúsculas. Su forehand plano es difícil de leer. Ha demostrado que puede batir a los mejores — derrotó a Djokovic en Roma 2024.",
    mentalNote: "Ha probado mentalmente que puede competir a máximo nivel cuando está confiado.",
  },
  {
    slug: "bautista-agut",
    name: "Roberto Bautista Agut",
    weapon: "backhand sólido y con dirección — de los mejores en colocación del circuito",
    weapon2: "return muy agresivo en el segundo servicio",
    weakness: "jugadores que explotan su saque (relativamente débil) desde el segundo servicio",
    weakness2: "pista rápida con grandes servidores que le sacan del ritmo",
    style: "counter-puncher",
    patterns: ["return + backhand pressure", "rally backhand CC + DTL", "baseline consistency"],
    clay: 8, hard: 7, grass: 7,
    serving: 6, returning: 9, netGame: 6, speed: 7, fitness: 8,
    pressure: "consistent", clutch: 7, comeback: 7,
    flexibility: "medium",
    tacticalNote: "Veterano extremadamente consistente. Su return y backhand son sus armas reales. No genera muchos winners pero raramente comete errores innecesarios — el rival tiene que ganar el punto activamente.",
    mentalNote: "El más consistente mentalmente de su generación. Ha llegado a semifinales de GS múltiples veces. Nunca se desmorona.",
    homeVenues: ["barcelona"],
  },
  {
    slug: "fokina",
    name: "Alejandro Davidovich Fokina",
    weapon: "forehand topspineado con defensa atlética en arcilla",
    weapon2: "backhand creativo con slice y drive",
    weakness: "pista rápida — su juego pesado pierde efectividad",
    weakness2: "inconsistencia táctica en momentos clave",
    style: "counter-puncher",
    patterns: ["clay forehand heavy topspin", "defensive retrieval + counter", "drop shot surprise"],
    clay: 8, hard: 6, grass: 5,
    serving: 6, returning: 7, netGame: 6, speed: 8, fitness: 8,
    pressure: "inconsistent", clutch: 5, comeback: 6,
    flexibility: "medium",
    tacticalNote: "En arcilla, su juego pesado y su velocidad le hacen rival incómodo para cualquier top-10. Fuera de la tierra roja, pierde gran parte de su ventaja táctica.",
    mentalNote: "Irregular — puede jugar un partido excepcional y en el siguiente desaparecer.",
    homeVenues: ["monte-carlo", "barcelona"],
  },
  {
    slug: "machac",
    name: "Tomas Machac",
    weapon: "forehand potente y plano",
    weapon2: "saque eficaz",
    weakness: "arcilla y peloteos físicos prolongados",
    style: "aggressive-baseliner",
    patterns: ["serve + forehand", "forehand inside-out"],
    clay: 6, hard: 8, grass: 7,
    serving: 8, returning: 7, netGame: 6, speed: 7, fitness: 7,
    pressure: "consistent", clutch: 7, comeback: 6,
    flexibility: "medium",
    tacticalNote: "Checo prometedor con buen saque y forehand agresivo. Ha derrotado a Sinner en un GS, lo que habla de su capacidad en los grandes.",
    mentalNote: "Competitivo y con demostración de nivel en las grandes ocasiones.",
  },
  {
    slug: "goffin",
    name: "David Goffin",
    weapon: "backhand técnicamente puro — uno de los mejores del circuito en precisión",
    weapon2: "velocidad y devolución",
    weakness: "físico — lesiones y la edad reducen su impacto",
    weakness2: "grandes saques que le sacan del ritmo",
    style: "counter-puncher",
    patterns: ["backhand DTL pressure", "return + backhand CC", "rally baseline exchange"],
    clay: 7, hard: 8, grass: 7,
    serving: 6, returning: 8, netGame: 7, speed: 7, fitness: 6,
    pressure: "consistent", clutch: 7, comeback: 6,
    flexibility: "high",
    tacticalNote: "Goffin tiene uno de los backhand más técnicamente puros del circuito. Las lesiones y la edad han reducido su impacto global, pero en buen día sigue siendo top-30 de facto.",
    mentalNote: "Muy profesional y consistente. Nunca se rinde.",
  },
  {
    slug: "wawrinka",
    name: "Stan Wawrinka",
    weapon: "backhand a una mano — históricamente el mejor del circuito; ángulos y timing únicos",
    weapon2: "saque potente",
    weakness: "la edad y las lesiones — ya no tiene el físico de su mejor época",
    style: "aggressive-baseliner",
    patterns: ["backhand DTL winner", "serve + backhand", "forehand inside-out"],
    clay: 8, hard: 8, grass: 6,
    serving: 8, returning: 7, netGame: 7, speed: 6, fitness: 6,
    pressure: "elevates", clutch: 9, comeback: 8,
    flexibility: "medium",
    tacticalNote: "Cuando Wawrinka está al 100%, su backhand a una mano es el más dañino del circuito. Sus tres títulos de GS son con backhand winners en los momentos más importantes.",
    mentalNote: "El 'clutch player' por excelencia de su generación — ganó 3 GS contra Djokovic (2 veces) y Federer. En los grandes momentos, eleva siempre.",
  },
  {
    slug: "monfils",
    name: "Gaël Monfils",
    weapon: "atletismo extremo — recuperaciones acrobáticas imposibles",
    weapon2: "forehand potente cuando está inspirado",
    weakness: "consistencia táctica y motivación real",
    style: "counter-puncher",
    patterns: ["defensive retrieval + counter", "forehand winner from extreme open stance"],
    clay: 7, hard: 8, grass: 7,
    serving: 7, returning: 8, netGame: 7, speed: 10, fitness: 8,
    pressure: "inconsistent", clutch: 4, comeback: 5,
    flexibility: "medium",
    tacticalNote: "La velocidad y reflejos de Monfils son únicos. Sus recuperaciones son literalmente imposibles para un humano normal. El problema es que a veces parece jugar para el espectáculo más que para ganar.",
    mentalNote: "Impredecible — puede ser el mejor del mundo por sets y luego rendirse. La motivación es su principal variable.",
  },
  {
    slug: "ramos-vinolas",
    name: "Albert Ramos-Vinolas",
    weapon: "forehand de alta torsión en arcilla + resistencia excepcional",
    weakness: "pista dura y grandes saques",
    style: "counter-puncher",
    patterns: ["clay forehand heavy", "defensive baseline clay"],
    clay: 8, hard: 5, grass: 4,
    serving: 5, returning: 6, netGame: 4, speed: 6, fitness: 8,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "low",
    tacticalNote: "Veterano especialista de arcilla. En tierra roja es un rival muy difícil incluso para los mejores del mundo.",
    mentalNote: "Sólido y resistente en su superficie. Fuera de ella, pierde efectividad.",
  },
  {
    slug: "navone",
    name: "Mariano Navone",
    weapon: "forehand topspineado en arcilla",
    weakness: "pista dura",
    style: "counter-puncher",
    patterns: ["clay forehand heavy rally"],
    clay: 7, hard: 5, grass: 4,
    serving: 5, returning: 6, netGame: 4, speed: 7, fitness: 8,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "low",
    tacticalNote: "Especialista de arcilla sudamericano. Sólido en su superficie natural.",
    mentalNote: "Consistente en arcilla.",
  },
  {
    slug: "comesana",
    name: "Francisco Comesaña",
    weapon: "forehand arcilla specialist",
    weakness: "pista rápida",
    style: "counter-puncher",
    patterns: ["forehand clay rally"],
    clay: 7, hard: 5, grass: 4,
    serving: 5, returning: 6, netGame: 4, speed: 7, fitness: 7,
    pressure: "consistent", clutch: 6, comeback: 5,
    flexibility: "low",
    tacticalNote: "Especialista de arcilla de Sudamérica.",
    mentalNote: "Consistente en su superficie.",
  },
  {
    slug: "bonzi",
    name: "Benjamin Bonzi",
    weapon: "forehand agresivo",
    weakness: "inconsistencia",
    style: "aggressive-baseliner",
    patterns: ["forehand CC + rally"],
    clay: 6, hard: 7, grass: 5,
    serving: 6, returning: 6, netGame: 5, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Francés agresivo pero irregular en los grandes torneos.",
    mentalNote: "Errático en los momentos importantes.",
  },
  {
    slug: "halys",
    name: "Quentin Halys",
    weapon: "forehand agresivo",
    weakness: "grandes servidores y pista rápida",
    style: "aggressive-baseliner",
    patterns: ["forehand CC", "baseline rally clay"],
    clay: 7, hard: 6, grass: 5,
    serving: 6, returning: 6, netGame: 5, speed: 6, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Francés de circuito que da guerra en arcilla.",
    mentalNote: "Inconsistente en los momentos más importantes.",
  },
  {
    slug: "cobolli",
    name: "Flavio Cobolli",
    weapon: "forehand agresivo desde la línea de fondo",
    weakness: "experiencia en torneos grandes — todavía en desarrollo",
    style: "aggressive-baseliner",
    patterns: ["forehand CC rally", "return + baseline"],
    clay: 7, hard: 7, grass: 5,
    serving: 6, returning: 7, netGame: 5, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Joven italiano con agresividad natural desde el fondo. En proceso de consolidación.",
    mentalNote: "Irregular — natural para su etapa de desarrollo.",
  },
  {
    slug: "nava",
    name: "Emilio Nava",
    weapon: "forehand + atletismo",
    weakness: "experiencia en el circuito principal",
    style: "aggressive-baseliner",
    patterns: ["forehand + baseline rally"],
    clay: 6, hard: 7, grass: 5,
    serving: 6, returning: 6, netGame: 5, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Joven americano en desarrollo en el circuito ATP.",
    mentalNote: "Construyendo su perfil mental.",
  },
  {
    slug: "muller",
    name: "Alexandre Müller",
    weapon: "saque + forehand",
    weakness: "inconsistencia",
    style: "big-server",
    patterns: ["serve + forehand"],
    clay: 6, hard: 7, grass: 6,
    serving: 8, returning: 6, netGame: 5, speed: 6, fitness: 6,
    pressure: "inconsistent", clutch: 5, comeback: 4,
    flexibility: "low",
    tacticalNote: "Puede tener semanas muy buenas con el saque. Irregular en el resto.",
    mentalNote: "Inconsistente.",
  },
  {
    slug: "mpetshi-perricard",
    name: "Giovanni Mpetshi Perricard",
    weapon: "saque — uno de los más potentes del circuito (220+ km/h, excelente ángulo por altura)",
    weapon2: "forehand potente",
    weakness: "falta de experiencia y peloteos prolongados",
    style: "big-server",
    patterns: ["serve + forehand winner"],
    clay: 5, hard: 7, grass: 8,
    serving: 10, returning: 6, netGame: 6, speed: 6, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 4,
    flexibility: "low",
    tacticalNote: "Su saque es el arma más poderosa del circuito por combinación de potencia y ángulo. Todavía construyendo el resto de su juego.",
    mentalNote: "Joven — perfil mental en desarrollo.",
  },
  {
    slug: "borges",
    name: "Nuno Borges",
    weapon: "forehand sólido desde el fondo",
    weakness: "jugadores con gran saque",
    style: "aggressive-baseliner",
    patterns: ["forehand CC rally"],
    clay: 7, hard: 7, grass: 6,
    serving: 6, returning: 7, netGame: 5, speed: 7, fitness: 7,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "medium",
    tacticalNote: "Portugués sólido que da guerra en todas las superficies. Mejor en arcilla.",
    mentalNote: "Fiable y sin grandes altibajos.",
  },
  {
    slug: "garin",
    name: "Cristian Garín",
    weapon: "forehand en arcilla — especialista clay con bote alto",
    weakness: "pista dura",
    style: "counter-puncher",
    patterns: ["forehand clay topspin", "baseline rally clay"],
    clay: 7, hard: 5, grass: 4,
    serving: 5, returning: 6, netGame: 4, speed: 6, fitness: 7,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "low",
    tacticalNote: "Especialista de arcilla de Sudamérica.",
    mentalNote: "Consistente en su superficie.",
  },
  {
    slug: "dzumhur",
    name: "Damir Džumhur",
    weapon: "velocidad y retrieval defensivo",
    weakness: "grandes servidores",
    style: "counter-puncher",
    patterns: ["defensive baseline exchange"],
    clay: 6, hard: 6, grass: 5,
    serving: 5, returning: 6, netGame: 4, speed: 8, fitness: 7,
    pressure: "consistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Veloz defensor que da problemas a los jugadores agresivos.",
    mentalNote: "Consistente.",
  },
  {
    slug: "basilashvili",
    name: "Nikoloz Basilashvili",
    weapon: "forehand devastador en días buenos — flat y potente",
    weakness: "inconsistencia extrema",
    style: "aggressive-baseliner",
    patterns: ["forehand flat winner", "serve + forehand"],
    clay: 6, hard: 8, grass: 6,
    serving: 7, returning: 6, netGame: 5, speed: 6, fitness: 6,
    pressure: "inconsistent", clutch: 4, comeback: 4,
    flexibility: "low",
    tacticalNote: "Puede ganar a cualquiera con el forehand en los días buenos. Los días malos son muy malos.",
    mentalNote: "Muy inconsistente. El factor extra-deportivo ha impactado su carrera.",
  },
  {
    slug: "shevchenko",
    name: "Alexander Shevchenko",
    weapon: "forehand + return",
    weakness: "grandes ocasiones",
    style: "aggressive-baseliner",
    patterns: ["forehand rally"],
    clay: 6, hard: 7, grass: 6,
    serving: 6, returning: 7, netGame: 5, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Kazajo con buen forehand en desarrollo.",
    mentalNote: "Construyendo su perfil en el tour.",
  },
  // ═══════════════ TOP 10-30 (faltantes) ══════════════════

  {
    slug: "ruud",
    name: "Casper Ruud",
    weapon: "forehand topspin en arcilla — velocidad de pelota y ángulos cruzados",
    weakness: "saque — mucha presión sobre el segundo servicio y en hierba",
    style: "aggressive-baseliner",
    patterns: ["forehand rally", "topspin cross", "apertura de pista con forehand"],
    clay: 10, hard: 7, grass: 5,
    serving: 5, returning: 7, netGame: 5, speed: 7, fitness: 9,
    pressure: "elevates", clutch: 8, comeback: 7,
    flexibility: "medium",
    tacticalNote: "El mejor especialista de arcilla del circuito junto a Nadal y Alcaraz. Su forehand topspin es devastador en tierra batida, construye puntos con paciencia y profundidad. En pista dura es sólido pero el saque lo limita. En hierba sufre notablemente.",
    mentalNote: "Excelente mentalidad competitiva, finalista de Roland Garros y US Open. No se desmorona en los grandes momentos.",
    homeVenues: ["Buenos Aires", "Santiago", "Bastad", "Gstaad"],
  },
  {
    slug: "etcheverry",
    name: "Tomás Etcheverry",
    weapon: "forehand de alto topspin — devastador en arcilla con pelota alta y cruzada",
    weakness: "pista rápida — el juego de fondo no tiene el mismo efecto, saque discreto",
    style: "aggressive-baseliner",
    patterns: ["topspin rally", "forehand inside-out", "pelota alta al backhand"],
    clay: 9, hard: 6, grass: 4,
    serving: 5, returning: 7, netGame: 4, speed: 7, fitness: 8,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "low",
    tacticalNote: "Especialista de arcilla argentino con uno de los forehand más pesados del circuito. El topspin extremo que genera hace muy difícil la defensa en tierra. En superficies rápidas pierde mucho por dependencia de la arcilla.",
    mentalNote: "Sólido competidor en tierra, más irregular en otros contextos.",
    homeVenues: ["Buenos Aires", "Rio de Janeiro"],
  },
  {
    slug: "baez",
    name: "Sebastián Báez",
    weapon: "velocidad de piernas + forehand agresivo — defensor que se convierte en atacante",
    weakness: "saque — uno de los saques más débiles del top 50, muy presionado",
    style: "counter-puncher",
    patterns: ["defensa activa", "cambio de ritmo", "subida tras defensa"],
    clay: 9, hard: 6, grass: 4,
    serving: 4, returning: 8, netGame: 5, speed: 9, fitness: 9,
    pressure: "consistent", clutch: 7, comeback: 8,
    flexibility: "medium",
    tacticalNote: "Extraordinario atleta y corredor que convierte la defensa en ataque. Saca muy poco pero compensa con el return y los primeros pasos. Especialista de arcilla sudamericana. En superficies rápidas el saque es un handicap demasiado grande.",
    mentalNote: "Muy aguerrido competitivamente. No se rinde aunque le vayan mal las cosas.",
    homeVenues: ["Buenos Aires", "Rio de Janeiro", "Córdoba"],
  },
  {
    slug: "griekspoor",
    name: "Tallon Griekspoor",
    weapon: "saque + forehand directo — juego rápido y agresivo en pista rápida",
    weakness: "arcilla — sin las herramientas para construir puntos largos, backhand pasivo",
    style: "aggressive-baseliner",
    patterns: ["saque-forehand", "finish rápido en pista dura", "forehand inside-in"],
    clay: 5, hard: 8, grass: 7,
    serving: 8, returning: 6, netGame: 6, speed: 7, fitness: 7,
    pressure: "consistent", clutch: 7, comeback: 6,
    flexibility: "medium",
    tacticalNote: "Neerlandés con uno de los saques más limpios del circuito. Su juego es directo y efectivo en pistas rápidas donde el saque corta el intercambio. No tiene paciencia para los peloteos de arcilla.",
    mentalNote: "Buen nivel competitivo en sus condiciones ideales.",
  },
  {
    slug: "michelsen",
    name: "Alex Michelsen",
    weapon: "saque potente + forehand plano — juego plano y rápido desde el fondo",
    weakness: "arcilla — estilo plano no le favorece, falta experiencia en Grand Slams",
    style: "aggressive-baseliner",
    patterns: ["saque-forehand", "forehand directo", "punto corto"],
    clay: 6, hard: 8, grass: 7,
    serving: 8, returning: 6, netGame: 5, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 6, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Joven americano con gran potencial ofensivo. Saque y forehand plano muy peligrosos en pista rápida. Está construyendo su juego en arcilla pero no es su superficie natural.",
    mentalNote: "Todavía construyendo su perfil mental en los grandes momentos del tour.",
  },
  {
    slug: "nakashima",
    name: "Brandon Nakashima",
    weapon: "backhand de dos manos preciso + movilidad defensiva",
    weakness: "finalizar los puntos — tiende a los peloteos largos sin el golpe ganador definitivo",
    style: "counter-puncher",
    patterns: ["backhand rally", "defensa desde fondo", "cambio de ritmo"],
    clay: 6, hard: 7, grass: 6,
    serving: 6, returning: 7, netGame: 5, speed: 8, fitness: 8,
    pressure: "consistent", clutch: 6, comeback: 7,
    flexibility: "medium",
    tacticalNote: "Americano con excelente defensa y backhand como arma principal. Su juego se basa en aguantar y contraatacar. Bastante equilibrado entre superficies pero sin arma ganadora clara.",
    mentalNote: "Competitivo y fiable, aunque le falta el punch para cerrar partidos contra los mejores.",
  },
  {
    slug: "van-de-zandschulp",
    name: "Botic van de Zandschulp",
    weapon: "forehand agresivo + saque — combinación directa en pista rápida",
    weakness: "consistencia — alterna momentos brillantes con errores no forzados en exceso",
    style: "aggressive-baseliner",
    patterns: ["forehand agresivo", "saque-forehand", "juego directo"],
    clay: 6, hard: 7, grass: 6,
    serving: 7, returning: 6, netGame: 5, speed: 6, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Neerlandés con talento ofensivo considerable pero muy irregular. Puede batir a cualquier top-10 un día y perder con el #80 al siguiente. Su forehand es peligroso pero la gestión del error voluntario es su gran asignatura pendiente.",
    mentalNote: "Gran inconsistencia mental — cuando le sale el juego es brillante, cuando se le va es difícil de controlar.",
  },

  // ═══════════════ 30-80 ATP (faltantes) ═══════════════════

  {
    slug: "mannarino",
    name: "Adrian Mannarino",
    weapon: "slice de revés + variaciones — ritmo cambiante y juego de red inesperado",
    weakness: "fuerza física — pierde intercambios de potencia contra golpeadores fuertes",
    style: "all-court",
    patterns: ["slice bajo", "subida a la red", "cambio de ritmo", "dejar corta + volea"],
    clay: 6, hard: 7, grass: 8,
    serving: 6, returning: 7, netGame: 7, speed: 7, fitness: 7,
    pressure: "consistent", clutch: 7, comeback: 6,
    flexibility: "high",
    tacticalNote: "Francés atípico que rompe el ritmo con el slice de revés y subidas a la red cuando nadie lo espera. No tiene el saque ni el golpe ganador de los grandes pero su inteligencia táctica lo mantiene en el top-50 desde hace años. Favorito en hierba por el slice bajo.",
    mentalNote: "Experimentado y sin complejos. Ha ganado a top-10 en días que nadie esperaba.",
  },
  {
    slug: "moutet",
    name: "Corentin Moutet",
    weapon: "creatividad táctica + slice — juego muy variado e impredecible",
    weakness: "potencia — pierde contra golpeadores que le saquen del ritmo con velocidad",
    style: "all-court",
    patterns: ["dejadas", "slice", "cambio de ritmo", "drop shot"],
    clay: 7, hard: 6, grass: 6,
    serving: 5, returning: 7, netGame: 6, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 6,
    flexibility: "high",
    tacticalNote: "Francés muy creativo con enorme variedad de golpes. Usa la dejada y el slice con mucha frecuencia. Puede sorprender a cualquiera en días buenos pero la inconsistencia le pasa factura. Su juego irregular hace difícil mantener el nivel durante tres sets.",
    mentalNote: "Muy irregular mentalmente — puede elevar o hundirse según el momento.",
  },
  {
    slug: "altmaier",
    name: "Daniel Altmaier",
    weapon: "resistencia + forehand profundo — especialista de arcilla alemán",
    weakness: "pista rápida — le falta potencia para terminar puntos cortos",
    style: "counter-puncher",
    patterns: ["peloteo profundo", "defensa activa", "forehand cruzado"],
    clay: 8, hard: 5, grass: 5,
    serving: 5, returning: 7, netGame: 4, speed: 7, fitness: 8,
    pressure: "consistent", clutch: 6, comeback: 7,
    flexibility: "low",
    tacticalNote: "Alemán especialista de arcilla con gran capacidad para aguantar y desgastar. Su forehand profundo en arcilla hace daño pero carece de arma decisiva en superficies rápidas. En tierra batida puede sorprender a cualquiera.",
    mentalNote: "Sólido mentalmente en arcilla, más frágil fuera de su superficie.",
  },
  {
    slug: "molcan",
    name: "Alex Molčan",
    weapon: "backhand de dos manos + resistencia física — especialista de arcilla",
    weakness: "saque y pista rápida — sin herramientas potentes fuera de la tierra",
    style: "counter-puncher",
    patterns: ["backhand cruzado", "peloteo fondo", "defensa tenaz"],
    clay: 8, hard: 5, grass: 4,
    serving: 5, returning: 7, netGame: 4, speed: 7, fitness: 8,
    pressure: "inconsistent", clutch: 5, comeback: 6,
    flexibility: "low",
    tacticalNote: "Eslovaco con juego de fondo sólido en arcilla. El backhand es su herramienta principal. Sin las condiciones de arcilla lentas es un jugador claramente inferior.",
    mentalNote: "Nivel mental inconsistente — sus resultados son muy variables.",
  },
  {
    slug: "diaz-acosta",
    name: "Facundo Díaz Acosta",
    weapon: "forehand pesado + pelota alta — especialista de arcilla sudamericana",
    weakness: "pista rápida — sin experiencia suficiente y estilo no adaptado",
    style: "aggressive-baseliner",
    patterns: ["topspin forehand", "pelota alta", "rally cruzado"],
    clay: 8, hard: 5, grass: 4,
    serving: 5, returning: 7, netGame: 4, speed: 8, fitness: 8,
    pressure: "inconsistent", clutch: 5, comeback: 6,
    flexibility: "low",
    tacticalNote: "Joven argentino con forehand muy pesado en arcilla. Emergente especialista de tierra batida sudamericana. Fuera de arcilla sus resultados son muy limitados.",
    mentalNote: "En desarrollo — datos insuficientes para evaluar su nivel mental.",
  },
  {
    slug: "navone",
    name: "Mariano Navone",
    weapon: "forehand pesado + resistencia — especialista de arcilla sudamericana emergente",
    weakness: "pista rápida — dependencia total de la arcilla para su estilo",
    style: "aggressive-baseliner",
    patterns: ["forehand topspin", "rally fondo", "punto largo"],
    clay: 8, hard: 5, grass: 4,
    serving: 5, returning: 7, netGame: 4, speed: 8, fitness: 8,
    pressure: "consistent", clutch: 6, comeback: 6,
    flexibility: "low",
    tacticalNote: "Argentino con ascenso meteórico en arcilla. Juego de fondo agresivo y resistente. La arcilla es su elemento natural y ahí es muy difícil de batir. En superficies rápidas es un jugador diferente.",
    mentalNote: "Buena actitud competitiva, todavía probando su nivel en grandes partidos.",
    homeVenues: ["Buenos Aires", "Rio de Janeiro", "Madrid"],
  },
  {
    slug: "vukic",
    name: "Aleksandar Vukic",
    weapon: "juego agresivo desde el fondo + saque sólido",
    weakness: "partidos largos — pierde potencia y concentración en sets 2-3",
    style: "aggressive-baseliner",
    patterns: ["saque-forehand", "forehand agresivo", "punto corto"],
    clay: 6, hard: 7, grass: 6,
    serving: 7, returning: 6, netGame: 5, speed: 7, fitness: 6,
    pressure: "inconsistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Australiano con juego directo y agresivo. Mejor en superficies rápidas donde puede terminar puntos. No tiene la resistencia para los partidos de arcilla muy largos.",
    mentalNote: "Inconsistente en los grandes momentos.",
  },
  {
    slug: "tien",
    name: "Learner Tien",
    weapon: "saque potente + forehand plano — joven agresivo en pista rápida",
    weakness: "experiencia y arcilla — estilo en desarrollo, muy nueva en el tour",
    style: "aggressive-baseliner",
    patterns: ["saque-forehand", "punto corto agresivo"],
    clay: 5, hard: 7, grass: 7,
    serving: 8, returning: 5, netGame: 5, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Joven americano con grandes condiciones físicas y saque potente. Está en fase de construcción en el tour pero su techo es alto en superficies rápidas.",
    mentalNote: "Todavía sin historial suficiente para evaluar su perfil en grandes momentos.",
  },

  {
    slug: "merida-aguilar",
    name: "Daniel Mérida",
    weapon: "forehand emergente — jugador en primeras etapas ATP",
    weakness: "muestra pequeña — datos estadísticos limitados (ver confianza)",
    style: "aggressive-baseliner",
    patterns: ["forehand rally"],
    clay: 6, hard: 7, grass: 5,
    serving: 6, returning: 6, netGame: 4, speed: 7, fitness: 7,
    pressure: "inconsistent", clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: "Jugador emergente. Sus estadísticas ATP son limitadas y no reflejan su nivel real todavía.",
    mentalNote: "Datos insuficientes para evaluar su perfil mental en ATP.",
  },
];

// ── Índice por slug ───────────────────────────────────────

const PROFILE_INDEX = new Map<string, TacticalProfile>(
  PROFILES.map((p) => [p.slug, p])
);

// ── API pública ───────────────────────────────────────────

export function getPlayerProfile(slug: string): TacticalProfile | null {
  return PROFILE_INDEX.get(slug) ?? null;
}

/**
 * Construye un perfil genérico basado en estilo inferido para jugadores
 * sin perfil manual, usando los datos estadísticos disponibles.
 */
export function buildGenericProfile(
  slug: string,
  style: string,
  clay: number,
  hard: number,
  grass: number,
): TacticalProfile {
  const s = style as StyleType;
  const weapon =
    s === "big-server" ? "saque potente" :
    s === "counter-puncher" ? "consistencia y resistencia desde el fondo" :
    s === "serve-and-volley" ? "saque + juego de red" :
    s === "all-court" ? "juego completo sin arma dominante clara" :
    "forehand agresivo desde el fondo";

  const weakness =
    s === "big-server" ? "peloteos largos cuando el saque no funciona" :
    s === "counter-puncher" ? "le falta el golpe ganador para terminar los puntos" :
    "sin debilidad identificada con la muestra actual";

  return {
    slug,
    name: slug,
    weapon,
    weakness,
    style: s,
    patterns: [],
    clay, hard, grass,
    serving: s === "big-server" ? 8 : 6,
    returning: s === "counter-puncher" ? 8 : 6,
    netGame: s === "serve-and-volley" ? 8 : 5,
    speed: s === "counter-puncher" ? 8 : 7,
    fitness: 7,
    pressure: "inconsistent",
    clutch: 5, comeback: 5,
    flexibility: "medium",
    tacticalNote: `Perfil inferido automáticamente — estilo ${style}. Sin datos manuales suficientes.`,
    mentalNote: "Sin historial suficiente para evaluar el perfil mental.",
  };
}

/**
 * Retorna el nombre de la superficie para textos en español.
 */
export function surfaceName(surface: string): string {
  if (surface.includes("clay")) return "arcilla";
  if (surface.includes("grass")) return "hierba";
  if (surface.includes("indoor")) return "pista dura indoor";
  return "pista dura";
}

/**
 * Enriquece un perfil táctico con insights dinámicos acumulados de partidos reales.
 * Los insights no sobreescriben el perfil estático — lo complementan añadiendo
 * observaciones recientes al tacticalNote y mentalNote.
 */
export function enrichProfileWithInsights(
  profile: TacticalProfile,
  insights: {
    matchPatterns: { dominio: number; batalla: number; irregular: number; remontada: number };
    tacticalObservations: string[];
    weaponsConfirmed: string[];
    weaknessesConfirmed: string[];
    mentalObservations: string[];
    matchCount: number;
  } | null,
): TacticalProfile {
  if (!insights || insights.matchCount === 0) return profile;

  const enriched = { ...profile };

  // Añadir patrones confirmados si son nuevos
  if (insights.weaponsConfirmed.length > 0) {
    const confirmed = insights.weaponsConfirmed[0];
    if (confirmed && !profile.weapon.toLowerCase().includes(confirmed.toLowerCase().slice(0, 8))) {
      enriched.weapon2 = confirmed;
    }
  }
  if (insights.weaknessesConfirmed.length > 0 && !profile.weakness2) {
    enriched.weakness2 = insights.weaknessesConfirmed[0];
  }

  // Enriquecer tactical note con observaciones recientes
  const recentObs = insights.tacticalObservations.slice(0, 3).filter(Boolean);
  if (recentObs.length > 0) {
    const obsText = recentObs.join(". ");
    enriched.tacticalNote = `${profile.tacticalNote} | Observaciones recientes (${insights.matchCount} partidos): ${obsText}`;
  }

  // Enriquecer mental note con datos reales de patrón
  const { dominio, batalla, irregular, remontada } = insights.matchPatterns;
  const total = dominio + batalla + irregular + remontada;
  if (total >= 5) {
    const pctDominio   = Math.round((dominio / total) * 100);
    const pctBatalla   = Math.round((batalla / total) * 100);
    const pctRemontada = Math.round((remontada / total) * 100);
    const patternSummary = [
      pctDominio   >= 30 ? `gana por dominio (${pctDominio}%)` : null,
      pctBatalla   >= 30 ? `muy regular en batallas (${pctBatalla}%)` : null,
      pctRemontada >= 20 ? `alta capacidad de remontada (${pctRemontada}%)` : null,
    ].filter(Boolean).join(", ");

    if (patternSummary) {
      const mentalExtra = insights.mentalObservations[0] ?? "";
      enriched.mentalNote = `${profile.mentalNote}${mentalExtra ? " " + mentalExtra : ""} | Patrón real: ${patternSummary}.`;
    }
  }

  return enriched;
}

/**
 * Retorna si el jugador 1 tiene ventaja táctica clara sobre el 2 en esta superficie.
 * Devuelve el diferencial de suitability.
 */
export function surfaceEdge(p1: TacticalProfile, p2: TacticalProfile, surface: string): number {
  const s = surface.includes("clay") ? "clay" : surface.includes("grass") ? "grass" : "hard";
  return p1[s] - p2[s];
}
