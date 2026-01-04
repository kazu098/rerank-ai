-- 不要になった価格関連カラムを削除
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行
--
-- 削除対象:
-- - base_currency: 基準通貨（現在は使用されていない）
-- - base_price_usd: USD基準の価格（現在はpricesカラムで直接管理）
-- - exchange_rates: 固定為替レート（現在は使用されていない）
-- - stripe_price_ids: 旧形式のPrice ID（stripe_price_ids_test/liveに移行済み）
--
-- 理由:
-- 現在のコードは以下のカラムのみを使用:
-- - prices: 各通貨ごとの価格（JPYは円単位、USD/EUR/GBPはセント単位）
-- - stripe_price_ids_test: テスト環境用のStripe Price ID
-- - stripe_price_ids_live: 本番環境用のStripe Price ID
--
-- 注意: このマイグレーションを実行する前に、以下が正しく設定されていることを確認してください:
-- - pricesカラム: 各通貨ごとの価格
-- - stripe_price_ids_test: テスト環境用のPrice ID
-- - stripe_price_ids_live: 本番環境用のPrice ID

-- カラムを削除（個別に実行して、存在しない場合はエラーにならないようにする）
-- PostgreSQLでは複数のカラムを一度に削除する場合、存在しないカラムがあるとエラーになる可能性があるため、個別に実行
DO $$ 
BEGIN
  -- base_currencyカラムが存在する場合のみ削除
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'plans' AND column_name = 'base_currency') THEN
    ALTER TABLE plans DROP COLUMN base_currency;
  END IF;
  
  -- base_price_usdカラムが存在する場合のみ削除
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'plans' AND column_name = 'base_price_usd') THEN
    ALTER TABLE plans DROP COLUMN base_price_usd;
  END IF;
  
  -- exchange_ratesカラムが存在する場合のみ削除
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'plans' AND column_name = 'exchange_rates') THEN
    ALTER TABLE plans DROP COLUMN exchange_rates;
  END IF;
  
  -- stripe_price_idsカラムが存在する場合のみ削除
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'plans' AND column_name = 'stripe_price_ids') THEN
    ALTER TABLE plans DROP COLUMN stripe_price_ids;
  END IF;
END $$;

