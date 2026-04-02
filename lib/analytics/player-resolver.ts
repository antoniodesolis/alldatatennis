/**
 * Resuelve nombres de jugadores de distintas fuentes (Sackmann CSV, TennisExplorer)
 * a te_slug (identificador canónico de la app).
 *
 * Fuentes:
 *   - Sackmann CSV: "Carlos Alcaraz", "Jannik Sinner"
 *   - TennisExplorer: slug "alcaraz", "sinner", "merida-aguilar"
 *   - ATP rankings map: lastName → atpCode (ya existente en player-photo route)
 */

// Mapa completo "slug-parte" → atpCode (copiado de player-photo route)
// Aquí lo usamos al revés: atpCode → te_slug
export const ATP_SLUG_MAP: Record<string, string> = {
  walton:"w09e", vallejo:"v0dp", mannarino:"me82", "davidovich-fokina":"dh50", fokina:"dh50",
  "moro-canas":"m0ht", canas:"m0ht", tabilo:"te30", kovacevic:"k0az", vukic:"v832",
  barrena:"b0gy", bolt:"bi81", "de-minaur":"dh58", minaur:"dh58", michelsen:"m0qi",
  molcan:"mv14", blockx:"b0pg", bublik:"bk92", shevchenko:"s0h2", zverev:"z355",
  muller:"mp20", popyrin:"p09z", galarneau:"gk06", "guillen-meza":"g0dh",
  collarini:"cc66", pellegrino:"ph64", andrade:"ag08", martin:"m0np",
  rublev:"re44", cazaux:"c0h0", fery:"f0dm", fils:"f0f1", gea:"g0ix",
  rinderknech:"rc91", holmgren:"h09n", shelton:"s0s1", bonzi:"bm95",
  tomic:"ta46", harris:"hd68", coric:"cg80", gojo:"gh92",
  "van-de-zandschulp":"v812", nakashima:"n0ae", norrie:"n771",
  "ugo-carabelli":"u182", carabelli:"u182", alcaraz:"a0e2", taberner:"te16", ruud:"rh16",
  broom:"bv21", rodesch:"r0e0", tseng:"t0ap", chidekh:"c0bh",
  tabur:"t09x", wong:"w0bh", smith:"s0ze", moutet:"mw02",
  garin:"gd64", svrcina:"s0gd", dzumhur:"d923", added:"a09t",
  sweeny:"s0ia", altmaier:"ae14", galan:"ge33", evans:"e687",
  merida:"m0n7", glinka:"g0by", medvedev:"mm58", goffin:"gb88",
  shapovalov:"su55", prizmic:"p0hw", lajovic:"l987", ymer:"y218",
  spizzirri:"s0ja", moller:"m0k4", nava:"n0am", quinn:"q02l",
  marozsan:"m0ci", "diaz-acosta":"d0cg", gomez:"gj16", cina:"c0nb",
  "auger-aliassime":"ag37", gill:"g0eu", jianu:"j09x", misolic:"m0jz",
  cobolli:"c0e9", tiafoe:"td51", maestrelli:"m0if", passaro:"p0ct",
  cerundolo:"c0au", comesana:"c0df", "ferreira-silva":"sn54",
  diallo:"d0f6", monfils:"mc65", onclin:"o0a2", olivieri:"o660",
  loffhagen:"l0cf", cadenazzo:"c0nn", bailly:"b0qc",
  "mpetshi-perricard":"m0gz", zeppieri:"z0a1", bueno:"b0gr",
  dimitrov:"d875", "den-ouden":"d0h9", medjedovic:"m0jf",
  mayot:"m0g4", rocha:"r0go", rune:"r0dg", hurkacz:"hb71",
  dellien:"da31", gaston:"g09o", grenier:"gf95", buse:"b0id",
  simakin:"s0o6", draper:"d0co", "pinnington-jones":"p0ht",
  fearnley:"f0by", faria:"f0f2", mensik:"m0ni", duckworth:"d994",
  mccabe:"m0oq", choinski:"ch12", struff:"sl28", sinner:"s0ag",
  kubler:"kb95", munar:"mu94", clarke:"ci14", brooksby:"b0cd",
  kym:"k0ep", "de-jong":"d0c1", lehecka:"l0bv", fonseca:"f0fv",
  "reis-da-silva":"r0a7", schwaerzler:"s0wt", thompson:"tc61",
  "prado-angelo":"p0iy", "juan-cerundolo":"c0c8", ficovich:"fa43",
  rodionov:"r09x", engel:"e0dd", uchida:"u120", majchrzak:"mq75",
  khachanov:"ke29", coppejans:"cg33", jacquet:"j0az", djere:"db63",
  midon:"m0oh", riedi:"r0fs", tien:"t0ha", draxl:"d0dp",
  "lloyd-harris":"hg86", giustino:"ga79", musetti:"m0ej",
  sonego:"su87", nardi:"n0bg", "van-assche":"v0dz", darderi:"d0fj",
  mikrut:"m0n1", pavlovic:"p0ay", klein:"ki63", neumayer:"n0cs",
  mcdonald:"mk66", huesler:"hh06", cecchinato:"cf01",
  trungelliti:"ta29", giron:"gc88", navone:"n0bs", cilic:"c977",
  lajal:"l0gh", damm:"d0dt", landaluce:"l0il", fucsovics:"f724",
  dodig:"d0l3", arnaldi:"a0fc", berrettini:"bk40", gigante:"g0gd",
  bellucci:"b0gg", houkes:"h0cx", zheng:"z0bz", kecmanovic:"ki95",
  echargui:"ea13", cassone:"c0ht", fatic:"f840", "budkov-kjaer":"b0u4",
  jarry:"j551", mejia:"m0aw", basilashvili:"bg23",
  basavareddy:"b0nn", djokovic:"d643", borges:"bt72",
  crawford:"c0ak", virtanen:"v0am", "carreno-busta":"cd85",
  "llamas-ruiz":"l0cx", kypson:"k0a3", "boscardin-dias":"b0fi",
  martinez:"mo44", herbert:"h996", halys:"hb64", jodar:"j0dz",
  collignon:"c0jp", sakamoto:"s0uv", opelka:"o522", bertola:"bu70",
  hijikata:"h0bh", noguchi:"n09u", "bautista-agut":"bd06",
  "carballes-baena":"cf59", burruchaga:"b0fv", safiullin:"sx50",
  "rodriguez-taverna":"rh59", baez:"b0bi", korda:"k0ah",
  ofner:"o513", mochizuki:"m0hu", shimabukuro:"sy67",
  wawrinka:"w367", travaglia:"ta12", sakellaridis:"s0kt",
  tsitsipas:"te51", griekspoor:"gj37", fritz:"fb98",
  atmane:"a0gc", tirante:"t0a1", "seyboth-wild":"sx91",
  skatov:"s0gr", droguet:"d0dw", samuel:"s0tm", gentzsch:"g0ib",
  "barrios-vera":"bs86", machac:"m0fh", etcheverry:"ea24",
  paul:"pl56", boyer:"b0ej", schoolkate:"s0n0", blanchet:"bv16",
  humbert:"hh26", royer:"r0eb", vacherot:"va25", gaubas:"g0fw",
  kopriva:"ki82", sachko:"ss25", hanfmann:"h997", zhou:"z0cq",
  wu:"wb32", nishioka:"n732", watanuki:"wb08", hsu:"h09f",
  bu:"y09v", svajda:"s0k7", kolar:"kh56", bergs:"bu13",
  piros:"p09o",
  shelbayh:"s0nv", "soriano-barrera":"s0bt", boitan:"b0c0",
  mchugh:"m0cw", santillan:"sq80", ayeni:"a09p", gray:"g0ao",
  "ramos-vinolas":"r772", hernandez:"h0cd",
  rybakov:"rg42", binda:"b0gi", vatutin:"v717", perez:"pl39",
  ilagan:"i0b0", guerrieri:"g0a0", picchione:"p0dr",
  "andrej-martin":"mf35", nedic:"n0db", fenty:"f0ck",
  chepelev:"co01", escoffier:"e768", ghibaudo:"g0iw",
  thanos:"t0ei", weber:"w0a4", shah:"s0w8", dougaz:"df88",
  zhukayev:"z09z", hassan:"hg94", bicknell:"b0i5",
  shick:"s0s5", holt:"h09p", gadamauri:"g0cv", hemery:"hb48",
  kingsley:"k0db", overbeck:"o0bi", caniato:"c0lk",
  stebe:"sk94", cretu:"c0b2", langmo:"li10", negritu:"n731",
  eubanks:"e865", denolly:"df92", vandermeersch:"v0bc",
  masur:"mn20", michalski:"m0e1", milavsky:"m0rg", rincon:"r0fp",
  yevseyev:"y171", suresh:"s0de", dedura:"d0lj", kuzmanov:"kc33",
  popko:"pg20", stricker:"s0la", ajdukovic:"a0cj", obradovic:"o0ai",
  butvilas:"b0mm", ribeiro:"r09v", winter:"w0c4", vasa:"v993",
  coulibaly:"c0hb", arutiunian:"a0ia", andaloro:"a0f3",
  bagnis:"bf23", mena:"mj98", sun:"sx90", zakaria:"z0bl",
  arnaboldi:"a0ba", bondioli:"b0pe", peliwo:"pf65", moroni:"m0gp",
  romano:"r0hk", bax:"b0bu", broska:"b0c5", agamenone:"aa27",
  roncadelli:"r0bt", piraino:"p0i6", johns:"j0b5", elias:"e698",
  blancaneaux:"bu54", ferrari:"f0cj", hussey:"h0dc",
  villanueva:"v821", justo:"j0aw", heide:"h0du", habib:"hf80",
  stewart:"s0ex", wendelken:"w0ah", matsuoka:"m0sc",
  squire:"s0ak", searle:"s0tx", casanova:"cg07",
  shiraishi:"s0c2", moriya:"mi01", chung:"ch27", barton:"b0ou",
  marcondes:"rd48", xilas:"x01c", gakhov:"ge28", loge:"l0id",
  story:"s0h9", trotter:"t0bw", sels:"so20", cui:"c0aj",
  monday:"m0on", forejtek:"f0bt", estevez:"e0di",
  varillas:"v836", shang:"s0re", boulais:"b0f8", singh:"s0ri",
  samrej:"s0hr", nishikori:"n552", feldbausch:"f0f4",
  lokoli:"lc12", tu:"tc01", broady:"bi23", marmousez:"m0gy",
  carboni:"c0ow", castelnuovo:"ch80", potenza:"p0b2",
  poullain:"pj74", ambrogi:"a0ik", ratti:"r0hp", maxted:"m0nj",
  pokorny:"p0hp", kasnikowski:"k0hc", dhamne:"d0ji",
  sharipov:"s0mn", polmans:"pg94", gengel:"g09c", topo:"t0fi",
  krumich:"k0fy", imamura:"i426", erhard:"e0ac",
  soto:"s0ek", rosenkranz:"rh62", dellavedova:"d0a2",
  basing:"b0je", wiskandt:"w0bb", mrva:"m0se", zhukov:"z0c3",
  geerts:"gg65", mmoh:"mp01", ribecai:"r0jw", damas:"d0cn",
  brunold:"b0lw", kukushkin:"k926", poljicak:"p0gq", karol:"k0hg",
  bouzige:"b0ek", kouame:"k0o4", oberleitner:"o0ad",
  gombos:"gb93", milic:"m0ur", pieczkowski:"p0it",
  prihodko:"pl64", tarvet:"t0gr", wallin:"w0bu", jasika:"j553",
  maloney:"m0re", zahraj:"z09f", jubb:"j0a4", kotov:"k09f",
  brunclik:"b0ov", nesterov:"n0cj", henning:"h0bf",
  sekulic:"s0ti", fellin:"f0bp", vandecasteele:"v0dg",
  albot:"a829", perot:"p0mg", brancaccio:"bv24", tokuda:"td55",
  gasquet:"g628", strombachs:"s0gv", bertrand:"b0jj",
  catry:"c0jt", molleker:"m0ac", nijboer:"n0b4",
  peniston:"ph78", purtseladze:"p0ea", banerjee:"b0i6",
  pieri:"p0hy", kopp:"k0cj", shin:"s09p", cuenin:"c0jx",
  sorger:"s0qz", fomin:"f0a3", kwon:"kf17", dostanic:"d0d4",
  kozlov:"ke64", palosi:"p0cy", napolitano:"n679", nagal:"n897",
  daniel:"da81", monteiro:"mj08", faurel:"f0ho",
  paris:"p0gn", berkieta:"b0p4", compagnucci:"c0bb",
  huang:"h0b5", zink:"z0ak", ursu:"u176",
  bielinskyi:"b0ll", durasovic:"dc76", erel:"e0aa",
  uchiyama:"u134", shimizu:"s0aq", zhang:"z371",
};

// Índice inverso: atpCode → te_slug (primera aparición)
const codeToSlug = new Map<string, string>();
for (const [slug, code] of Object.entries(ATP_SLUG_MAP)) {
  if (!codeToSlug.has(code)) codeToSlug.set(code, slug);
}

function normalize(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

/**
 * Convierte un nombre completo (ej. "Jannik Sinner", "Carlos Alcaraz") al te_slug.
 * Estrategia: buscar el apellido en el mapa ATP_SLUG_MAP.
 */
export function nameToSlug(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return null;

  // Último token = apellido
  const lastName = normalize(parts[parts.length - 1]);
  if (ATP_SLUG_MAP[lastName]) return lastName;

  // Primer token (nombres como "de Minaur" están al final pero ATP invierte)
  const firstName = normalize(parts[0]);
  if (ATP_SLUG_MAP[firstName]) return firstName;

  // Búsqueda parcial
  for (const key of Object.keys(ATP_SLUG_MAP)) {
    if (normalize(key) === lastName) return key;
    if (normalize(key).includes(lastName) || lastName.includes(normalize(key))) return key;
  }

  return null;
}

/**
 * Dado un apellido como aparece en Sackmann CSV ("Alcaraz", "De Minaur"),
 * devuelve el te_slug canónico.
 */
export function sackmannNameToSlug(winner: string, loser: string): [string | null, string | null] {
  return [nameToSlug(winner), nameToSlug(loser)];
}

/**
 * Normaliza superficie al formato canónico de la app.
 */
export function normalizeSurface(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s === "clay") return "clay";
  if (s === "hard") return "hard";
  if (s === "grass") return "grass";
  if (s.includes("carpet")) return "carpet";
  if (s.includes("indoor") || s.includes("hard")) return "indoor hard";
  return s;
}

/**
 * Normaliza ronda al formato canónico.
 */
export function normalizeRound(raw: string): string {
  const map: Record<string, string> = {
    "round of 128": "R128", "round of 64": "R64", "round of 32": "R32",
    "round of 16": "R16", "quarterfinals": "QF", "quarterfinal": "QF",
    "semifinals": "SF", "semifinal": "SF", "final": "F",
    "q1": "Q1", "q2": "Q2",
  };
  return map[raw.toLowerCase().trim()] ?? raw.toUpperCase();
}
