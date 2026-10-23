// Pix "copia e cola" (BR Code estático, padrão do Banco Central) a partir da chave. Sem servidor, sem rede.
//   const payload = payloadPix({ chave, nome, cidade, valor?, txid? });  // texto do copia-e-cola e do QR code
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .\-]/g, '').trim();
const campo = (id, valor) => id + String(valor.length).padStart(2, '0') + valor;

// CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF), exigido no fim do BR Code.
export function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function payloadPix({ chave, nome = '', cidade = '', valor = 0, txid = '***' }) {
  const k = String(chave || '').trim();
  if (!k) return '';
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', k);
  let p = campo('00', '01') + campo('01', '11') + campo('26', conta) + campo('52', '0000') + campo('53', '986');
  if (valor > 0) p += campo('54', Number(valor).toFixed(2));
  p += campo('58', 'BR')
    + campo('59', (semAcento(nome) || 'APOIO').slice(0, 25))
    + campo('60', (semAcento(cidade) || 'BRASIL').slice(0, 15))
    + campo('62', campo('05', (semAcento(txid).replace(/\s/g, '') || '***').slice(0, 25)));
  p += '6304';
  return p + crc16(p);
}
