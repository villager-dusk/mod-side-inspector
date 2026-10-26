import {mkdirSync,writeFileSync,readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import assert from 'node:assert/strict';
import {analyzeFile} from './analyzer.js';
const root='test-results/annotation-fixtures';mkdirSync(root,{recursive:true});
const sources={
 'net/minecraftforge/fml/common/Mod.java':'package net.minecraftforge.fml.common; import java.lang.annotation.*; @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.TYPE) public @interface Mod { String modid(); boolean clientSideOnly() default false; boolean serverSideOnly() default false; }',
 'net/neoforged/fml/common/Mod.java':'package net.neoforged.fml.common; import java.lang.annotation.*; @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.TYPE) public @interface Mod { String value(); Dist[] dist() default {Dist.CLIENT,Dist.DEDICATED_SERVER}; public enum Dist {CLIENT,DEDICATED_SERVER;} }',
 'example/LegacyClient.java':'package example; @net.minecraftforge.fml.common.Mod(modid="legacy_client",clientSideOnly=true) public class LegacyClient { public static final long TEST = 9999999999L; public void test() {} }',
 'example/LegacyServer.java':'package example; @net.minecraftforge.fml.common.Mod(modid="legacy_server",serverSideOnly=true) public class LegacyServer {}',
 'example/NeoClient.java':'package example; @net.neoforged.fml.common.Mod(value="neo_test",dist={net.neoforged.fml.common.Mod.Dist.CLIENT}) public class NeoClient {}',
 'example/NeoCommon.java':'package example; @net.neoforged.fml.common.Mod("neo_test") public class NeoCommon {}'
};
for(const [path,content]of Object.entries(sources)){const full=join(root,path);mkdirSync(join(full,'..'),{recursive:true});writeFileSync(full,content);}
const result=spawnSync('D:/java21/bin/javac.exe',['-d',root,...Object.keys(sources).map(p=>join(root,p))],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
async function check(id,classes,category,neo=false){
 const entries=Object.fromEntries(classes.map(c=>[c,readFileSync(join(root,c))]));
 if(neo)entries['META-INF/neoforge.mods.toml']=strToU8('modLoader="javafml"\nloaderVersion="[1,)"\nlicense="MIT"\n[[mods]]\nmodId="neo_test"\nversion="1"');
 else entries['mcmod.info']=strToU8(JSON.stringify([{modid:id,name:id,version:'1'}]));
 const output=await analyzeFile(new File([zipSync(entries)],'annotation.jar'));
 assert.equal(output.category,category,JSON.stringify(output));if(category!=='unknown')assert.equal(output.confidence,'明确声明');
}
await check('legacy_client',['example/LegacyClient.class'],'client');
await check('legacy_server',['example/LegacyServer.class'],'server');
await check('neo_test',['example/NeoClient.class'],'client',true);
await check('neo_test',['example/NeoClient.class','example/NeoCommon.class'],'unknown',true);
console.log('4 项真实 Java 编译注解检查通过');
