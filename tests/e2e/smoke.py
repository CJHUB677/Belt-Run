import asyncio, sys, json
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
OUT = 'shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await page.goto(URL); await page.wait_for_timeout(1500)
        await page.screenshot(path=OUT + '01-garage.png')
        for name in ['races', 'upgrades', 'tune', 'dealer', 'mycars', 'settings']:
            await page.evaluate(f"__belt.go('{name}')"); await page.wait_for_timeout(700)
            await page.screenshot(path=OUT + f'02-{name}.png')
        print('ERRORS', json.dumps(errs, indent=1))
        await b.close()
asyncio.run(main())
