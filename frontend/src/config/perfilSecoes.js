// Seções de "Perfil e configurações": cada uma é uma página (/mais/<id>). O índice (views/Mais.vue) e o Perfil.vue leem daqui.
import { User, Wallet, PiggyBank, DatabaseBackup, ShieldCheck, SlidersHorizontal, Bell, Info } from 'lucide-vue-next';

export const SECOES_PERFIL = [
  { id: 'perfil', rotulo: 'Perfil', icone: User },
  { id: 'financas', rotulo: 'Minhas finanças', icone: Wallet },
  { id: 'reserva', rotulo: 'Plano da Reserva de Liberdade', icone: PiggyBank },
  { id: 'dados-backup', rotulo: 'Dados e backup', icone: DatabaseBackup },
  { id: 'seguranca', rotulo: 'Segurança', icone: ShieldCheck },
  { id: 'configuracoes', rotulo: 'Configurações', icone: SlidersHorizontal },
  { id: 'notificacoes', rotulo: 'Notificações', icone: Bell },
  { id: 'sobre', rotulo: 'Sobre o app', icone: Info },
];
