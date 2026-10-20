import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs=[]
        for (w, h, name) in [(667, 375, 'se'), (1180, 820, 'ipad'), (390, 844, 'portrait')]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True)
            page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
            await page.goto(URL); await page.wait_for_timeout(900)
            await page.screenshot(path=f'shots/20-{name}-garage.png')
            if name == 'portrait': continue
            await page.evaluate("__belt.go('upgrades')"); await page.wait_for_timeout(400); await page.screenshot(path=f'shots/21-{name}-upgrades.png')
            await page.evaluate("__belt.launch({kind:'quick', venue:'ny', distance:'quarter', opp:{car:'m5', lv:{engine:2,power:2,intake:2,nitrous:1,body:2,tires:2,gearbox:2}, ai:4}, title:'Quick Race'})")
            await page.wait_for_timeout(500); await page.keyboard.down('ArrowUp'); await page.wait_for_timeout(3600)
            await page.screenshot(path=f'shots/22-{name}-race.png'); await page.keyboard.up('ArrowUp')
            await ctx.close()
        print('ERRORS', errs); await b.close()
asyncio.run(main())
