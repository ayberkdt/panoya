import { docFromText } from '@panoya/blocks';
import type { DomainCommand, Workspace } from '@panoya/domain';
import type { WorkspaceStore } from '@panoya/storage';

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
  await page(assets, 'Kasım örneği', [
    text('Örnek: 300 EUR nakit, 200 EUR banka. (Finans blokları G5 aşamasında gelecek.)'),
  ]);
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
