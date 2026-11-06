// 日記やコメントを保存しているSupabaseにつなぐための設定。
// 接続先を示すURL。
const supabaseUrl = "https://wqhcznhalhpsxchkdauz.supabase.co";
// ブラウザーから接続するための公開キー。閲覧や変更の許可範囲はSupabase側の設定で制限する。
const supabaseKey = "sb_publishable_MJMHNXpq8mx3WJ1TH5uuxw_PCMUiamL";

// index.htmlで読み込んだSupabase用ライブラリーを使って接続を準備する。
// diary.jsとcomment.jsは、この接続を使って日記やコメントを読み書きする。
const supabaseClient = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);
