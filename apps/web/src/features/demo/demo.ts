import { docFromText } from '@panoya/blocks';
import type { DomainCommand, Workspace } from '@panoya/domain';
import type { WorkspaceStore } from '@panoya/storage';
import { tr, type MessageKey } from '../../i18n/tr';
import { MANUAL_SOURCE, WALLET_IDS, localToday, walletTemplate } from '../table/templates';

/**
 * Synthetic demo content from spec 23 (opt-in only). URLs use the non-resolving example.invalid
 * domain; no real people, addresses or balances.
 */
export const DEMO_MAIL_BODY =
  'Hocam merhaba,\n\nHazırladığım örnek belgeleri ekte paylaşıyorum.\n\nDesteğiniz için teşekkür ederim.\n\nSaygılarımla,';

export async function createDemo(store: WorkspaceStore, workspace: Workspace): Promise<string> {
  const ws = workspace.id;
  const exec = async (command: DomainCommand) =>
    (await store.execute(command)).mutation.primary!.id;
  const folder = (name: string, parentFolderId: string | null = null) =>
    exec({ type: 'createFolder', workspaceId: ws, parentFolderId, name });
  const notebook = (folderId: string, title: string) =>
    exec({ type: 'createNotebook', workspaceId: ws, folderId, title });
  const page = (
    notebookId: string,
    title: string,
    blocks: { type: string; payload: unknown }[] = [],
  ) => exec({ type: 'createPage', workspaceId: ws, notebookId, title, blocks });
  const text = (value: string) => ({ type: 'richText', payload: { doc: docFromText(value) } });

  const uni = await folder('Üniversite');
  const links = await notebook(uni, 'Linkler');
  const firstPage = await page(links, 'Satellite Systems', [
    {
      type: 'link',
      payload: {
        title: 'Yoklama',
        url: 'https://example.invalid/attendance?course=demo#form',
        description: 'Her dersin başında doldurulur.',
        category: 'Satellite Systems',
        tags: ['yoklama'],
      },
    },
    {
      type: 'link',
      payload: {
        title: 'Ders materyalleri',
        url: 'https://example.invalid/materials',
        description: '',
        category: 'Satellite Systems',
        tags: [],
      },
    },
  ]);
  const lectures = await notebook(uni, 'Ders notları');
  await page(lectures, 'Rocket Propulsion', [
    { type: 'heading', payload: { text: 'Hafta 1', level: 2 } },
    text('Özgül itki (Isp), itkinin yakıt ağırlık debisine oranıdır.'),
    {
      type: 'checklist',
      payload: {
        items: [
          { id: 'a1', text: 'Ödev 1', checked: false },
          { id: 'a2', text: 'Okuma: bölüm 2', checked: true },
        ],
      },
    },
  ]);

  const research = await folder('Araştırmalar');
  const papers = await notebook(research, 'Makaleler');
  await page(papers, 'Ay yörüngesi', [text('Okuma notları burada.')]);

  const finance = await folder('Finans');
  const assets = await notebook(finance, 'Varlıklarım');
  const walletPage = await page(assets, 'Cüzdan');
  await exec({
    type: 'createTableBlock',
    workspaceId: ws,
    pageId: walletPage,
    placement: { kind: 'end' },
    ...walletTemplate((k: MessageKey) => tr[k], 'TRY'),
    rows: demoWalletRows(localToday()),
    source: MANUAL_SOURCE,
  });
  const travel = await notebook(finance, 'Seyahat');
  await page(travel, 'Bütçe', [text('Seyahat bütçesi: 320 EUR')]);

  const personal = await folder('Kişisel');
  const drafts = await notebook(personal, 'Mail taslakları');
  await page(drafts, 'Proje desteği', [
    {
      type: 'mailDraft',
      payload: {
        title: 'Proje desteği',
        to: ['demo@example.invalid'],
        cc: [],
        bcc: [],
        subject: 'Proje desteği hakkında',
        body: { format: 'plain', text: DEMO_MAIL_BODY },
        language: 'tr',
      },
    },
    {
      type: 'quickCopy',
      payload: { title: 'İmza', text: 'Saygılarımla,\nÖrnek Öğrenci', format: 'plain' },
    },
  ]);
  return firstPage;
}

/** Sample wallet entries spread over this month and the two before it (relative to today). */
function demoWalletRows(today: string) {
  const ym = (back: number) => {
    const d = new Date(
      Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1),
    );
    return d.toISOString().slice(0, 7);
  };
  const day = Math.min(Number(today.slice(8, 10)), 28);
  const on = (back: number, d: number) =>
    `${ym(back)}-${String(Math.min(d, back === 0 ? day : 28)).padStart(2, '0')}`;
  const entry = (
    date: string,
    note: string,
    category: string,
    flow: 'in' | 'out',
    amount: string,
  ) => ({
    cells: {
      [WALLET_IDS.date]: { kind: 'date' as const, value: date },
      [WALLET_IDS.note]: { kind: 'text' as const, value: note },
      [WALLET_IDS.category]: { kind: 'select' as const, optionId: category },
      [WALLET_IDS.flow]: { kind: 'select' as const, optionId: flow },
      [WALLET_IDS.amount]: { kind: 'money' as const, amount, currency: 'TRY' },
    },
  });
  return [
    entry(on(2, 1), 'Maaş', 'salary', 'in', '42000'),
    entry(on(2, 3), 'Kira', 'rent', 'out', '15000'),
    entry(on(2, 9), 'Market', 'market', 'out', '4120.30'),
    entry(on(2, 15), 'Elektrik ve su', 'bills', 'out', '1310.75'),
    entry(on(1, 1), 'Maaş', 'salary', 'in', '42000'),
    entry(on(1, 3), 'Kira', 'rent', 'out', '15000'),
    entry(on(1, 12), 'Uçak bileti', 'transport', 'out', '6890'),
    entry(on(1, 18), 'Market', 'market', 'out', '3875.60'),
    entry(on(1, 22), 'Konser', 'fun', 'out', '2400'),
    entry(on(1, 25), 'Faturalar', 'bills', 'out', '1420.10'),
    entry(on(0, 1), 'Maaş', 'salary', 'in', '42000'),
    entry(on(0, 2), 'Kira', 'rent', 'out', '15000'),
    entry(on(0, 4), 'Haftalık market', 'market', 'out', '1650.40'),
    entry(on(0, 6), 'Akbil yükleme', 'transport', 'out', '600'),
    entry(on(0, 8), 'İnternet', 'bills', 'out', '549.90'),
  ];
}
