import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_timeout(600)
        for venue, car in [('fl', 'hellcat'), ('ga', 'r35'), ('tx', 'userx4'), ('ja', 'dc5')]:
            await page.evaluate(f"""(()=>{{const S=__belt.S; S.owned['{car}']=S.owned['{car}']||{{lv:{{engine:0,power:0,intake:0,nitrous:3,body:0,tires:0,gearbox:0}},tune:{{}}}}; S.owned['{car}'].lv.nitrous=3; S.owned['{car}'].tune.nosSeconds=9; S.owned['{car}'].tune.tc='off'; S.current='{car}';}})()""")
            await page.evaluate(f"__belt.launch({{kind:'test', venue:'{venue}', distance:'quarter', opp:null, title:'Test'}})")
            await page.wait_for_timeout(500)
            await page.keyboard.down('ArrowUp')
            shot = 0
            for i in range(300):
                st = await page.evaluate("(()=>{const r=__race,c=r.cars[0];return {ph:r.phase,g:c.st.gear,rpm:c.st.eOmega*9.549,lim:c.bc.limiter,cl:c.st.clutch,sh:c.st.shiftT,x:c.st.x,sp:c.st.spinning}})()")
                if st['ph'] == 'run':
                    if st['g'] >= 2: await page.keyboard.down('n')
                    if st['rpm'] > st['lim']*0.95 and st['cl']=='lock' and st['sh']==0: await page.keyboard.press('ArrowRight')
                    if shot == 0 and st['x'] > 1.5: await page.screenshot(path=f'shots/10-{venue}-launch.png'); shot = 1
                    if shot == 1 and st['g'] >= 3: await page.screenshot(path=f'shots/11-{venue}-nos.png'); shot = 2; break
                await page.wait_for_timeout(16)
            await page.keyboard.up('ArrowUp'); await page.keyboard.up('n')
            await page.evaluate("document.getElementById('pause-quit').click()")
            await page.wait_for_timeout(300)
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
