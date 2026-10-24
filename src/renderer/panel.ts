import { GOAL_LABEL, GOALS, type Goal } from '../shared/goals';
import { CHANNELS, type PanelState } from '../shared/ipc';
import { bridge, el, fmtFE } from './common';

const $ = (id: string) => document.getElementById(id)!;

const GOAL_DESC: Record<Goal, string> = {
  fe: 'Carta que mais vale em FE (preços TITrack)',
  hero: 'Mais Hero Memories × mais Drop Rarity: maior chance de vermelha',
  scrap: 'Mais Memory Scraps no baú (conta o ×2/×3 da rodada)',
  thread: 'Mais Memory Threads no baú (conta o ×2/×3 da rodada)',
  invitation: 'Boss Whisper: mais Void Sea Invitations',
};

function pill(id: string, ok: boolean | 'warn', text: string, tip: string): void {
  const p = $(id);
  p.textContent = text;
  p.title = tip;
  p.className = `pill ${ok === 'warn' ? 'warn' : ok ? 'ok' : 'bad'}`;
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

let currentGoal: Goal | null = null;

function renderGoals(goal: Goal): void {
  if (goal === currentGoal) return;
  currentGoal = goal;
  $('goal-current').textContent = GOAL_LABEL[goal];
  $('goals').replaceChildren(
    ...GOALS.map((g) => {
      const b = el('button', `goal${g === goal ? ' on' : ''}`);
      b.append(el('span', 'dotsel'), el('span', 'gname', GOAL_LABEL[g]), el('span', 'gdesc', GOAL_DESC[g]));
      b.addEventListener('click', () => bridge.send(CHANNELS.goal, g));
      return b;
    }),
  );
}

function render(s: PanelState): void {
  pill('st-log', s.logActive, 'Log', s.logPath ?? 'UE_game.log não encontrado');
  pill('st-game', s.gameFound, 'Jogo', s.gameFound ? 'Janela encontrada' : 'Torchlight: Infinite não está aberto');
  const age = s.pricesAt ? Math.round((Date.now() - s.pricesAt) / 60_000) : null;
  pill(
    'st-prices',
    // falha parcial (algum item) com preços em cache = amarelo, não vermelho
    s.pricesAt === null ? false : s.pricesError ? 'warn' : true,
    age === null ? 'Preços' : `Preços ${age}min`,
    s.pricesError ?? 'TITrack, mediana da última hora (season 1601)',
  );

  const notice = $('notice');
  notice.hidden = !s.notice;
  notice.textContent = s.notice ?? '';

  $('total').textContent = fmtFE(s.totalFE);
  $('perhour').textContent = s.perHour === null ? '' : `${fmtFE(s.perHour)} FE/h`;
  $('maptime').textContent = fmtTime(s.mapTimeMs);
  const state = $('mapstate');
  state.textContent = s.inMap ? '● no mapa' : 'no hideout';
  state.classList.toggle('on', s.inMap);
  $('chests').textContent = String(s.chests);
  $('lastchest').textContent = s.chests ? `último ${fmtFE(s.lastChestFE)} FE` : '';

  const qty = (k: string) => s.rows.filter((r) => r.key.startsWith(k)).reduce((a, r) => a + r.qty, 0);
  $('scrapqty').textContent = String(qty('scrap'));
  $('threadqty').textContent = String(qty('thread'));
  $('scrapfe').textContent = fmtFE(s.scrapFE);
  $('threadfe').textContent = fmtFE(s.threadFE);
  const sum = s.scrapFE + s.threadFE;
  ($('vs-scrap') as HTMLElement).style.width = sum ? `${(s.scrapFE / sum) * 100}%` : '50%';
  ($('vs-thread') as HTMLElement).style.width = sum ? `${(s.threadFE / sum) * 100}%` : '50%';

  renderGoals(s.goal);

  $('round-picks').textContent = `${s.round.picks}/6`;
  $('round-g').textContent = `${fmtFE(s.round.guaranteedFE)} FE`;
  $('round-e').textContent = `${fmtFE(s.round.expectedFE)} FE`;
  $('round-j').textContent = `${fmtFE(s.round.jackpotFE)} FE`;
  $('round-box').title = s.round.summary.join('\n') || 'Nenhuma carta escolhida ainda nesta rodada';

  // só os itens que já caíram nesta sessão
  const dropped = s.rows.filter((r) => r.qty > 0);
  $('rows').replaceChildren(
    ...dropped.map((r) => {
      const tr = el('tr');
      tr.append(el('td', '', r.label), el('td', '', String(r.qty)), el('td', '', r.fe === null ? 'sem preço' : `${fmtFE(r.fe)} FE`));
      return tr;
    }),
  );
  if (!dropped.length) $('rows').replaceChildren(el('caption', 'empty', 'Nada ainda nesta sessão'));

  $('prices').replaceChildren(
    ...s.prices.map((p) => {
      const tr = el('tr');
      tr.append(el('td', '', p.label), el('td', '', `${fmtFE(p.fe)} FE`));
      return tr;
    }),
  );

  $('overlay').textContent = s.overlayVisible ? 'Esconder overlay' : 'Mostrar overlay';
}

bridge.on(CHANNELS.panel, (s) => render(s as PanelState));

// Lembra quais seções estavam abertas.
for (const id of ['round-box', 'goal-box', 'drops-box', 'prices-box']) {
  const d = $(id) as HTMLDetailsElement;
  try {
    const saved = localStorage.getItem(`open:${id}`);
    // a rodada começa aberta; as outras, fechadas
    d.open = saved === null ? id === 'round-box' : saved === '1';
  } catch {
    // sem storage: fica fechado
  }
  d.addEventListener('toggle', () => {
    try {
      localStorage.setItem(`open:${id}`, d.open ? '1' : '0');
    } catch {
      // ignora
    }
  });
}

// A janela acompanha a altura do conteúdo (área transparente sobrando bloquearia cliques no jogo).
new ResizeObserver(() => bridge.send(CHANNELS.resize, Math.ceil($('card').getBoundingClientRect().height) + 12)).observe($('card'));

$('close').addEventListener('click', () => bridge.send(CHANNELS.quit));
$('analyze').addEventListener('click', () => bridge.send(CHANNELS.analyze));
$('reset').addEventListener('click', () => bridge.send(CHANNELS.reset));
$('overlay').addEventListener('click', () => bridge.send(CHANNELS.toggleOverlay));
