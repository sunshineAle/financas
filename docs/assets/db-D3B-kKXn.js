import{g as Ra}from"./validarBackup-Dc5RnRzy.js";import{a as Oa}from"./esquema-Bg2nDc4v.js";function _a(L,t){return t.forEach(function(c){c&&typeof c!="string"&&!Array.isArray(c)&&Object.keys(c).forEach(function(i){if(i!=="default"&&!(i in L)){var d=Object.getOwnPropertyDescriptor(c,i);Object.defineProperty(L,i,d.get?d:{enumerable:!0,get:function(){return c[i]}})}})}),Object.freeze(L)}var ma={join:(...L)=>L.join("/")},Na={existsSync:()=>!0,mkdirSync:()=>{}};const Z="demo_sistema_v2";function pa(L){const t=atob(L),c=new Uint8Array(t.length);for(let i=0;i<t.length;i++)c[i]=t.charCodeAt(i);return c}function Ua(L){let t="";for(let c=0;c<L.length;c+=32768)t+=String.fromCharCode.apply(null,L.subarray(c,c+32768));return btoa(t)}const Ea=L=>L.map(t=>t===void 0?null:typeof t=="boolean"?t?1:0:typeof t=="bigint"?Number(t):t);function fa(){const L=globalThis.__SQL,t=globalThis.__PERSISTENCIA_BANCO||null;let c=null;if(!t)try{c=localStorage.getItem(Z)}catch{}let i=null;try{i=t?t.bytes||null:c?pa(c):null}catch{i=null}const d=i?new L.Database(i):new L.Database,g=!!i,X=(N,O,a)=>{const o=d.prepare(N);try{o.bind(Ea(O));const E=[];for(;o.step()&&(E.push(o.getAsObject()),!!a););return E}finally{o.free()}},F={},S=()=>{try{d.exec("PRAGMA foreign_keys = ON")}catch{}Object.entries(F).forEach(([N,O])=>{try{d.create_function(N,O)}catch{}})},M={veioSalvo:g,pragma(N){try{d.exec("PRAGMA "+N)}catch{}},exec(N){d.exec(N)},function(N,O){F[N]=O,d.create_function(N,O)},prepare(N){return{get:(...O)=>X(N,O.flat(),!1)[0],all:(...O)=>X(N,O.flat(),!0),run:(...O)=>{d.run(N,Ea(O.flat()));const a=d.getRowsModified(),o=d.exec("SELECT last_insert_rowid()")[0].values[0][0];return{changes:a,lastInsertRowid:o}}}},transaction(N){return(...O)=>{d.exec("BEGIN");try{const a=N(...O);return d.exec("COMMIT"),a}catch(a){try{d.exec("ROLLBACK")}catch{}throw a}}},exportarBytes(){const N=d.export();return S(),N},salvar(){if(t){t.agendar(()=>M.exportarBytes());return}try{const N=d.export();S(),localStorage.setItem(Z,Ua(N))}catch{S()}},apagarSalvo(){if(t){t.apagar();return}try{localStorage.removeItem(Z)}catch{}}};return globalThis.__BANCO_DEMO=M,M}var Sa=fa,Ia={pastaDados:"/"},Da={randomUUID:()=>globalThis.crypto.randomUUID()},J,ia;function Ca(){if(ia)return J;ia=1;function L(t){t.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      nome TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);try{t.exec("ALTER TABLE usuarios ADD COLUMN sessao_versao INTEGER NOT NULL DEFAULT 1")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}t.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      usuario_id INTEGER PRIMARY KEY,
      notificar_categoria_estourada INTEGER NOT NULL DEFAULT 1,
      notificar_fatura_proxima INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS contas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'corrente',
      origem TEXT NOT NULL DEFAULT 'manual',
      saldo REAL NOT NULL DEFAULT 0,
      cor TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS dividas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      saldo_original REAL NOT NULL,
      saldo REAL NOT NULL,
      taxa_juros REAL,
      urgencia TEXT NOT NULL DEFAULT 'amarelo',
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS historico_pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      divida_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (divida_id) REFERENCES dividas(id) ON DELETE CASCADE
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS categorias_orcamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      teto_mensal REAL NOT NULL,
      gasto_atual REAL NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS categorias_receita (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      icone TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS categorias_receita_init (usuario_id INTEGER PRIMARY KEY);
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS tokens_open_finance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      token_criptografado TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo',
      ultima_sincronizacao TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      categoria_id INTEGER,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      categorizacao_automatica INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      FOREIGN KEY (categoria_id) REFERENCES categorias_orcamento(id) ON DELETE SET NULL
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS reserva_liberdade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL UNIQUE,
      meta REAL NOT NULL,
      valor_atual REAL NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS historico_aportes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      data TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reserva_id) REFERENCES reserva_liberdade(id) ON DELETE CASCADE
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS cartoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      conta_id INTEGER,
      nome TEXT NOT NULL,
      limite REAL,
      dia_fechamento INTEGER NOT NULL,
      dia_vencimento INTEGER NOT NULL,
      origem TEXT NOT NULL DEFAULT 'manual',
      id_externo TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE SET NULL
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS lancamentos_cartao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cartao_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      compra_id TEXT NOT NULL,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data_compra TEXT NOT NULL,
      parcela_numero INTEGER NOT NULL DEFAULT 1,
      total_parcelas INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (cartao_id) REFERENCES cartoes(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_lancamentos_cartao ON lancamentos_cartao(cartao_id);
  `);try{t.exec("ALTER TABLE lancamentos_cartao ADD COLUMN divida_id INTEGER REFERENCES dividas(id) ON DELETE SET NULL")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}try{t.exec("ALTER TABLE transacoes ADD COLUMN origem TEXT NOT NULL DEFAULT 'conectada'")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}for(const i of["ALTER TABLE historico_aportes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'mensal'","ALTER TABLE historico_aportes ADD COLUMN descricao TEXT","ALTER TABLE historico_aportes ADD COLUMN conta_id INTEGER REFERENCES contas(id) ON DELETE SET NULL","ALTER TABLE transacoes ADD COLUMN categoria_receita TEXT","ALTER TABLE contas ADD COLUMN icone TEXT","ALTER TABLE historico_aportes ADD COLUMN operacao TEXT NOT NULL DEFAULT 'aporte'","ALTER TABLE historico_aportes ADD COLUMN ativo TEXT","ALTER TABLE historico_aportes ADD COLUMN quantidade REAL","ALTER TABLE historico_aportes ADD COLUMN preco_unitario REAL","ALTER TABLE categorias_orcamento ADD COLUMN icone TEXT","ALTER TABLE categorias_orcamento ADD COLUMN cor TEXT","ALTER TABLE contas ADD COLUMN id_externo TEXT","ALTER TABLE contas ADD COLUMN conexao_id INTEGER","ALTER TABLE cartoes ADD COLUMN conexao_id INTEGER","ALTER TABLE transacoes ADD COLUMN id_externo TEXT","ALTER TABLE lancamentos_cartao ADD COLUMN id_externo TEXT","ALTER TABLE categorias_receita ADD COLUMN cor TEXT","ALTER TABLE dividas ADD COLUMN arquivada INTEGER NOT NULL DEFAULT 0","ALTER TABLE dividas ADD COLUMN conta_id INTEGER REFERENCES contas(id) ON DELETE SET NULL","ALTER TABLE historico_pagamentos ADD COLUMN transacao_id INTEGER","ALTER TABLE lancamentos_cartao ADD COLUMN categoria_id INTEGER REFERENCES categorias_orcamento(id) ON DELETE SET NULL","ALTER TABLE transacoes ADD COLUMN subcategoria TEXT","ALTER TABLE transacoes ADD COLUMN ignorada INTEGER NOT NULL DEFAULT 0","ALTER TABLE cartoes ADD COLUMN icone TEXT","ALTER TABLE lancamentos_cartao ADD COLUMN subcategoria TEXT"])try{t.exec(i)}catch(d){if(!String(d.message).includes("duplicate column"))throw d}t.exec(`
    UPDATE historico_aportes SET operacao = 'resgate' WHERE tipo = 'resgate';
    UPDATE historico_aportes SET tipo = 'outro'
      WHERE tipo IN ('mensal', 'extra', 'rendimento', 'transferencia', 'resgate');
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS metas_reserva (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL,
      nome TEXT NOT NULL DEFAULT 'Reserva de Liberdade',
      icone TEXT,
      tipo_investimento TEXT,
      valor_meta REAL NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reserva_id) REFERENCES reserva_liberdade(id) ON DELETE CASCADE
    );
  `);try{t.exec("ALTER TABLE metas_reserva ADD COLUMN prazo TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}t.exec(`
    UPDATE historico_aportes SET tipo = 'cdi' WHERE tipo = 'outro';
    UPDATE metas_reserva SET tipo_investimento = NULL WHERE tipo_investimento = 'outro';
  `);let c=!1;try{t.exec("ALTER TABLE historico_aportes ADD COLUMN meta_id INTEGER REFERENCES metas_reserva(id) ON DELETE SET NULL"),c=!0}catch(i){if(!String(i.message).includes("duplicate column"))throw i}c&&t.exec(`
      UPDATE historico_aportes SET meta_id = (
        SELECT m.id FROM metas_reserva m
        WHERE m.reserva_id = historico_aportes.reserva_id
          AND (m.tipo_investimento = historico_aportes.tipo OR m.tipo_investimento IS NULL)
        ORDER BY m.id LIMIT 1);
    `),t.exec(`
    CREATE TABLE IF NOT EXISTS faturas_pagas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cartao_id INTEGER NOT NULL,
      fatura TEXT NOT NULL,
      conta_id INTEGER,
      transacao_id INTEGER,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cartao_id, fatura),
      FOREIGN KEY (cartao_id) REFERENCES cartoes(id) ON DELETE CASCADE
    );
  `),t.exec(`
    CREATE TABLE IF NOT EXISTS conexoes_pluggy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      banco TEXT,
      status TEXT NOT NULL DEFAULT 'ativa',
      ultima_sincronizacao TEXT,
      ultimo_erro TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (usuario_id, item_id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS investimentos_conectados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      conexao_id INTEGER NOT NULL,
      id_externo TEXT NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT,
      saldo REAL NOT NULL DEFAULT 0,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conexao_id) REFERENCES conexoes_pluggy(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transacoes_externo ON transacoes(usuario_id, id_externo) WHERE id_externo IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lancamentos_externo ON lancamentos_cartao(usuario_id, id_externo) WHERE id_externo IS NOT NULL;
  `)}return J={prepararLegado:L},J}var aa,na;function ga(){if(na)return aa;na=1;function L(a){return String(a).padStart(2,"0")}function t(a,o){return new Date(Date.UTC(a,o,0)).getUTCDate()}function c({ano:a,mes:o},E){const T=a*12+(o-1)+E;return{ano:Math.floor(T/12),mes:T%12+1}}function i({ano:a,mes:o},E){const T=Math.min(E,t(a,o));return`${a}-${L(o)}-${L(T)}`}function d({ano:a,mes:o}){return`${a}-${L(o)}`}function g(a){const[o,E]=a.split("-").map(Number);return{ano:o,mes:E}}function X(a){if(typeof a!="string"||!/^\d{4}-\d{2}-\d{2}$/.test(a))return!1;const[o,E,T]=a.split("-").map(Number);return E<1||E>12?!1:T>=1&&T<=t(o,E)}function F(a,o,E,T=!1){const[A,m,I]=a.split("-").map(Number),h=Math.min(o,t(A,m)),C=(T?I<h:I<=h)?{ano:A,mes:m}:c({ano:A,mes:m},1);return E>o?C:c(C,1)}function S(a,o,E,T=1,A=!1){const m=F(a,o,E,!!A);return d(c(m,T-1))}function M(a,o,E){const T=g(a),A=E>o?T:c(T,-1);return{fecha:i(A,o),vence:i(T,E)}}function N(a,o){const E=Math.round(a*100),T=Math.floor(E/o),A=E-T*o;return Array.from({length:o},(m,I)=>(T+(I<A?1:0))/100)}function O(a){return Math.round(a*100)/100}return aa={dataValida:X,faturaDaParcela:S,datasDaFatura:M,dividirEmParcelas:N,arredondar:O,chaveDoMes:d},aa}var ea,sa;function Fa(){if(sa)return ea;sa=1;const L=Da,t=Na,{prepararLegado:c}=Ca(),i=ga(),{TABELAS:d,ORDEM:g,criarEsquema:X,sqlTabela:F,SQL_AGORA:S,VERSAO_ESQUEMA:M}=Oa,N="__n";function O(e,n){return!!e.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(n)}function a(e,n){return e.prepare(`PRAGMA table_info(${n})`).all()}const o=(e,n)=>{if(!O(e,n))return!1;const s=a(e,n).find(l=>l.name==="id");return!!s&&/INT/i.test(String(s.type))};function E(e){return o(e,"usuarios")||o(e,"contas")}function T(e){const n=String(e||"").trim();if(!n)return null;if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(n)){const[s,l]=n.replace("Z","").split(/[ T]/),[R,p]=l.split(".");return`${s}T${R}.${(p||"0").padEnd(3,"0").slice(0,3)}Z`}return/^\d{4}-\d{2}-\d{2}$/.test(n)?`${n}T00:00:00.000Z`:null}const A=e=>Math.round((Number(e)||0)*1e6)/1e6;function m(e,n){const s={contagens:{},totais:{},mapas:{}};for(const r of g)O(e,r)&&(s.contagens[r]=e.prepare(`SELECT COUNT(*) AS n FROM ${r}`).get().n);const l=r=>A(e.prepare(r).get().t);s.totais.saldoContas=l("SELECT COALESCE(SUM(saldo), 0) AS t FROM contas"),s.totais.transacoes=l("SELECT COALESCE(SUM(valor), 0) AS t FROM transacoes"),s.totais.dividas=l("SELECT COALESCE(SUM(saldo), 0) AS t FROM dividas"),s.totais.pagamentos=l("SELECT COALESCE(SUM(valor), 0) AS t FROM historico_pagamentos"),s.totais.reserva=l("SELECT COALESCE(SUM(valor_atual), 0) AS t FROM reserva_liberdade"),s.totais.aportes=l("SELECT COALESCE(SUM(valor), 0) AS t FROM historico_aportes"),s.totais.lancamentos=l("SELECT COALESCE(SUM(valor), 0) AS t FROM lancamentos_cartao"),s.totais.faturasPagas=l("SELECT COALESCE(SUM(valor), 0) AS t FROM faturas_pagas");const R=(r,v,G)=>{const u={};v.forEach(U=>{const[x,Y]=G(U);u[x]=(u[x]||0)+Y}),s.mapas[r]=Object.fromEntries(Object.entries(u).map(([U,x])=>[U,A(x)]))};R("saldoPorConta",e.prepare("SELECT id, saldo FROM contas").all(),r=>[n("contas",r.id),r.saldo]),R("gastoAtualPorCategoria",e.prepare("SELECT id, gasto_atual FROM categorias_orcamento").all(),r=>[n("categorias_orcamento",r.id),r.gasto_atual]),R("totalPorCategoria",e.prepare("SELECT categoria_id, valor FROM transacoes").all(),r=>[r.categoria_id?n("categorias_orcamento",r.categoria_id):"-",r.valor]),R("qtdPorConta",e.prepare("SELECT conta_id FROM transacoes").all(),r=>[n("contas",r.conta_id),1]),R("saldoDivida",e.prepare("SELECT id, saldo FROM dividas").all(),r=>[n("dividas",r.id),r.saldo]),R("pagamentosPorDivida",e.prepare("SELECT divida_id, valor FROM historico_pagamentos").all(),r=>[n("dividas",r.divida_id),r.valor]),R("aportesPorMeta",e.prepare("SELECT meta_id, valor FROM historico_aportes").all(),r=>[r.meta_id?n("metas_reserva",r.meta_id):"-",r.valor]);const p=e.prepare("SELECT id, dia_fechamento, dia_vencimento FROM cartoes").all(),f=Object.fromEntries(p.map(r=>[r.id,r])),w=e.prepare("SELECT cartao_id, data_compra, parcela_numero, valor FROM lancamentos_cartao").all();return R("faturasPorCartao",w,r=>{const v=f[r.cartao_id],G=v?i.faturaDaParcela(r.data_compra,v.dia_fechamento,v.dia_vencimento,r.parcela_numero):"?";return[`${n("cartoes",r.cartao_id)}|${G}`,r.valor]}),R("lancamentosPorDivida",e.prepare("SELECT divida_id, valor FROM lancamentos_cartao").all(),r=>[r.divida_id?n("dividas",r.divida_id):"-",r.valor]),s}function I(e,n){const s=[],l=(R,p,f)=>{new Set([...Object.keys(p),...Object.keys(f)]).forEach(r=>{const v=p[r]===void 0?0:p[r],G=f[r]===void 0?0:f[r];Math.abs(v-G)>1e-4&&s.push(`${R}[${r}]: antes ${v}, depois ${G}`)})};return l("contagem",e.contagens,n.contagens),l("total",e.totais,n.totais),Object.keys(e.mapas).forEach(R=>l(R,e.mapas[R],n.mapas[R]||{})),s}function h(e){const n=[];for(const s of g){const l=d[s];for(const[R,p]of Object.entries(l.fk)){const f=e.prepare(`SELECT COUNT(*) AS n FROM ${s} WHERE ${R} IS NOT NULL AND ${R} NOT IN (SELECT id FROM ${p})`).get().n;f&&n.push(`${s}.${R}: ${f} liga\xE7\xE3o(\xF5es) para ${p} que n\xE3o existe`)}}return n}function C(e,n){try{if(!n||typeof t.copyFileSync!="function")return null;try{e.pragma("wal_checkpoint(TRUNCATE)")}catch{}const s=new Date().toISOString().replace(/[-:T]/g,"").slice(0,14),l=`${n}.pre-uuid-${s}.bak`;return t.copyFileSync(n,l),l}catch(s){throw new Error(`N\xE3o foi poss\xEDvel fazer a c\xF3pia de seguran\xE7a antes da migra\xE7\xE3o: ${s.message}`)}}function b(e,n={}){c(e);const s={copia:null,tabelas:{},avisos:[]};if(s.copia=C(e,n.arquivo),typeof e.copiaSeguranca=="function")try{e.copiaSeguranca("pre-uuid"),s.copia=s.copia||"gancho:pre-uuid"}catch{}const l=g.filter(u=>O(e,u)),R={};l.forEach(u=>{R[u]=a(e,u).some(U=>U.name==="id")});const p=(u,U)=>String(R[U]?u.id:u._rid),f={},w={},r={};l.forEach(u=>{f[u]={},w[u]={},r[u]=e.prepare(`SELECT rowid AS _rid, * FROM ${u} ORDER BY rowid`).all(),r[u].forEach(U=>{const x=L.randomUUID();f[u][p(U,u)]=x,w[u][x]=p(U,u)})});const v=m(e,(u,U)=>String(U)),G=L.randomUUID();e.pragma("foreign_keys = OFF");try{e.transaction(()=>{e.exec(`CREATE TABLE IF NOT EXISTS aparelho (id TEXT PRIMARY KEY NOT NULL, nome TEXT, criado_em TEXT NOT NULL DEFAULT (${S}))`);const u=e.prepare("SELECT id FROM aparelho LIMIT 1").get(),U=u?u.id:G;u||e.prepare("INSERT INTO aparelho (id, nome, criado_em) VALUES (?, NULL, ?)").run(G,new Date().toISOString()),l.forEach(_=>e.exec(F(_,N)));const x=new Date().toISOString();for(const _ of l){const y=d[_],Q=y.todas,ua=e.prepare(`INSERT INTO ${_}${N} (${Q.join(", ")}) VALUES (${Q.map(()=>"?").join(", ")})`),da=new Set(a(e,_).map(B=>B.name));let W=0;for(const B of r[_]){const ra={};for(const D of y.colunas){let $=da.has(D)?B[D]:void 0;const k=y.fk[D];if(k&&$!==void 0&&$!==null){const z=f[k]&&f[k][String($)];if(z)$=z;else{if(/NOT NULL/i.test(y.cols.find(V=>V.split(/\s+/)[0]===D)))throw new Error(`${_} #${p(B,_)} aponta para ${k} #${$}, que n\xE3o existe`);W++,$=null}}if($===void 0){const P=y.cols.find(V=>V.split(/\s+/)[0]===D).match(/DEFAULT\s+('([^']*)'|-?\d+(\.\d+)?)/i);$=P?P[2]!==void 0?P[2]:Number(P[1]):null}ra[D]=$}const Aa=T(B.criado_em)||T(B.data)||T(B.atualizado_em)||x,la=Q.map(D=>D==="id"?f[_][p(B,_)]:D==="criado_em"||D==="alterado_em"?Aa:D==="alterado_por_aparelho"?U:D==="excluido_em"?null:ra[D]);ua.run(...la)}s.tabelas[_]=r[_].length,W&&s.avisos.push(`${_}: ${W} liga\xE7\xE3o(\xF5es) para registros que n\xE3o existiam foram esvaziadas`)}l.forEach(_=>{e.exec(`DROP TABLE ${_}`),e.exec(`ALTER TABLE ${_}${N} RENAME TO ${_}`)}),X(e);const Y=m(e,(_,y)=>w[_]&&w[_][y]||`?${y}`),q=[...I(v,Y),...h(e)];if(q.length)throw new Error(`confer\xEAncia n\xE3o bateu: ${q.slice(0,8).join("; ")}${q.length>8?` (+${q.length-8})`:""}`);s.conferencia={contagens:Y.contagens,totais:Y.totais},e.prepare("INSERT INTO diario_alteracoes (id, tabela, registro_id, operacao, antes, depois, aparelho, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(L.randomUUID(),"*","esquema","migracao",null,JSON.stringify({para:`esquema ${M} (UUID)`,tabelas:s.tabelas,avisos:s.avisos}),U,new Date().toISOString())})()}catch(u){throw new Error(`A migra\xE7\xE3o do banco para UUID falhou e foi desfeita (o banco ficou como estava${s.copia?`; c\xF3pia em ${s.copia}`:""}): ${u.message}`)}finally{e.pragma("foreign_keys = ON")}return s}function H(e,n={}){return E(e)?b(e,n):(X(e),null)}return ea={iniciar:H,precisaMigrar:E,migrarParaUuid:b,fotografia:m,compararFotografias:I},ea}var oa,Ta;function Ma(){if(Ta)return oa;Ta=1;const L={tipo:"dia",dia:1},t=a=>String(a).padStart(2,"0"),c=a=>`${a.getFullYear()}-${t(a.getMonth()+1)}-${t(a.getDate())}`,i=(a,o)=>new Date(a,o,0).getDate();function d(a){const o=a%19,E=Math.floor(a/100),T=a%100,A=Math.floor(E/4),m=E%4,I=Math.floor((E+8)/25),h=Math.floor((E-I+1)/3),C=(19*o+E-A-h+15)%30,b=Math.floor(T/4),H=T%4,e=(32+2*m+2*b-C-H)%7,n=Math.floor((o+11*C+22*e)/451);return new Date(a,Math.floor((C+e-7*n+114)/31)-1,(C+e-7*n+114)%31+1)}const g={};function X(a){if(g[a])return g[a];const o=new Set(["01-01","04-21","05-01","09-07","10-12","11-02","11-15","12-25"].concat(a>=2024?["11-20"]:[]).map(A=>`${a}-${A}`)),E=d(a),T=new Date(E);return T.setDate(E.getDate()-2),o.add(c(T)),g[a]=o}const F=()=>globalThis.__SF_INICIO_MES&&(globalThis.__SF_INICIO_MES.tipo==="dia"||globalThis.__SF_INICIO_MES.tipo==="util")?globalThis.__SF_INICIO_MES:L;function S(a,o,E=F()){if(E.tipo==="util"){const T=Math.max(1,Math.min(20,Number(E.n)||5)),A=X(a);let m=0;for(let I=1;I<=i(a,o);I++){const h=new Date(a,o-1,I),C=h.getDay();if(!(C===0||C===6||A.has(c(h)))&&++m===T)return h}return new Date(a,o-1,i(a,o))}return new Date(a,o-1,E.dia==="ultimo"?i(a,o):Math.max(1,Math.min(28,Number(E.dia)||1)))}function M(a,o=F()){const E=String(a||"").slice(0,10),T=Number(E.slice(0,4)),A=Number(E.slice(5,7));return!T||!A?null:o.tipo==="dia"&&Number(o.dia)===1?E.slice(0,7):E>=c(S(T,A,o))?`${T}-${t(A)}`:A===1?`${T-1}-12`:`${T}-${t(A-1)}`}function N(a,o,E=F()){const T=S(a,o,E),A=o===12?S(a+1,1,E):S(a,o+1,E),m=new Date(A);return m.setDate(A.getDate()-1),{de:c(T),ate:c(m)}}function O(a){try{typeof a.function=="function"?a.function("mes_fin",o=>M(o)):console.warn("[mes_fin] banco sem db.function")}catch(o){console.error("[mes_fin] n\xE3o registrada:",o&&o.message)}}return oa={chaveDaData:M,inicioDoMes:S,intervaloDoMes:N,registrar:O},oa}const ha=ma,ca=Na,va=Sa,ta=Ia.pastaDados;ca.existsSync(ta)||ca.mkdirSync(ta,{recursive:!0});const Xa=ha.join(ta,"sistema.db"),j=new va;j.pragma("journal_mode = WAL");const K=Fa().iniciar(j,{arquivo:Xa});K&&(console.log("[banco] Migra\xE7\xE3o para UUID conclu\xEDda:",JSON.stringify(K.tabelas),K.copia?`c\xF3pia: ${K.copia}`:""),(K.avisos||[]).forEach(L=>console.warn("[banco] aviso:",L)));j.pragma("foreign_keys = ON");Ma().registrar(j);var La=j,Ga=Ra(La),ya=_a({__proto__:null,default:Ga},[La]);export{La as a,Da as c,ya as d};
