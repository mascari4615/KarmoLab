import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublisherSaleAssetInfo } from './unity-free';

afterEach(() => vi.unstubAllGlobals());

describe('공식 HTML에서 무료 에셋 정보 추출', () => {
  it('쿠폰, 엔티티 제목, 선물 링크와 대표 이미지의 상대 주소 보존', async () => {
    const fetch = vi.fn(async (input: string) => {
      if (input.endsWith('/ko-KR/publisher-sale')) return new Response('<body><script>coupon code NOTREAL</script><h1>Add Foil &amp; Flame to your cart</h1><p>coupon code DEMOGIFT</p><p>Promotion ends October 31.</p><a href="/packages/tools/demo-123" aria-label="Get your free gift">선물</a></body>');
      if (input === 'https://assetstore.unity.com/packages/tools/demo-123') return new Response('<meta property="og:image" content="/demo.png">');
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetch);
    expect(await fetchPublisherSaleAssetInfo()).toEqual({ couponCode: 'DEMOGIFT', assetName: 'Foil & Flame', assetUrl: 'https://assetstore.unity.com/packages/tools/demo-123', promoText: 'Promotion ends October 31.', imageUrl: 'https://assetstore.unity.com/demo.png' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('한국어 선물 문구와 이미지 대체 경로 처리', async () => {
    const fetch = vi.fn(async (input: string) => {
      if (input.endsWith('/ko-KR/publisher-sale')) return new Response('<body><a href="/packages/demo-123" title="무료 선물 받기">받기</a></body>');
      if (input === 'https://assetstore.unity.com/packages/demo-123') return new Response('<img src="/fallback.jpg">');
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetch);
    const result = await fetchPublisherSaleAssetInfo();
    expect(result).toMatchObject({ couponCode: null, assetUrl: 'https://assetstore.unity.com/packages/demo-123', imageUrl: 'https://assetstore.unity.com/fallback.jpg' });
  });

  it('일반 유료 상품은 무료 선물로 분류하지 않음', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<body><a href="/packages/paid-123">Buy this asset</a></body>'));
    vi.stubGlobal('fetch', fetch);
    expect(await fetchPublisherSaleAssetInfo()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('수집 HTTP 오류는 빈 성공 결과로 바꾸지 않음', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })));
    await expect(fetchPublisherSaleAssetInfo()).rejects.toThrow('503');
  });
});
