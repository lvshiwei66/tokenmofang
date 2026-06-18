# Token魔方原始需求

Token魔方(tokenmofang)是一个轻松管理和使用第三方大语言模型提供商的工具;
它通过查找和修改用户部署的各类Agent配置文档实现模型与提供商的切换。

## 主要模块和功能：

### 模块：
- CLI，命令行程序，在用户本地运行
- API，后端服务接口，部署在云端

### 功能：
1. 查询第三方模型提供商列表
2. 切换和设置提供商以及模型
3. 测试服务商接口健康状况
4. 支持回滚


### 命令清单:

```bash	
tmf setup 			# 初始化
tmf list 			# 浏览供应商清单
tmf test				# 测试供应商
tmf use				# 切换供应商
tmf rollback	# 回滚
tmf import		# 导入设置
tmf export 		# 导出设置
```

## 场景和用法

### 1. 检测本地所有支持的AI应用和配置文档路径

对用户系统安装的AI应用进行一个调查，并保存一个检测报告;
该命令应该在安装脚本中自动运行，或者安装后提示用户手动运行;

```bash
# 初始化设置
sudo tmf setup

# 期望的输出结果

检测到4个应用
- codex
   path: ~/.codex
   version: 0.1.2
   config: ~/.codex/.toml
- claude-code : 
   path: ~/.claude
   version: 1.1.2
   config path: ~/.claude/settings.json
- openclaw: 
   path: ~/.openclaw
   version: 0.1.2
   config path: ~/.openclaw/setting.yaml
```

**要求**

- 该命令需要授权高级权限
- 检测结果形成结构化报告形式保存在本地

### 2. 用户浏览供应商清单

```bash
# 默认用法，最多返回20条
tmf list 

# 返回所有的供应商
tmf list --all 

# 期望的结果输出示例

已获得前20个供应商： 

# 名称 延迟 价格(每百万) 速率(每秒) 模态 标签
-------------------------------------------------------
packcode 		200ms $0.04 17t/s 文本 claude-code-max 
xcodcs 			79ms $1.25 45t/s 图像 codex专用 
rightcode 	400ms $0.21  80t/s 视频 
...

总共 120 家供应商. 使用参数 --all 展示所有供应商
```

### 3. 用户决定切换某个供应商和模型

```bash
# 将codex切换到packcode这家供应商
tmf use packcode --key sk-my-api-key-string --app codex 

# 参数说明
  --key 供应商提供的api key
  --app 指定某个应用名称

# 期望的输出结果示例
  正在备份设置
  修改成功，请重启应用
```

**注意**

- 切换前总是执行备份
- 用户没有必要每次都使用命令行设置api key 以及模型参数，程序应记住上一次的用户的设置
- 如果用户仅安装了一个应用例如codex, 则--app参数可以省略，这依赖setup过程检测报告的判断，这个设定适用于所有支持--app参数的命令
- 在切换失败时自动重试，并在重试前重新执行setup检测
- 一家供应商通常

### 3.1 用户决定使用某个供应商，但未提供api key

以交互形式询问用户输入

```bash
# 设置切换到packcode
tmf use packcode --app claude

# 程序输出询问并等待输入

请输入api-key：
sk-...

请输入模型名称：
gpt5.5

```

**注意**

若用户曾经提供过部分参数，在输入时可提示用户当前的值，可以直接回车保持不变

### 3.2 用户决定回滚

使用备份的设置进行替换;
默认地把备份文件路径保存在应用配置相同的路径，只增加.bak扩展名结尾
例如claude-code配置文件路径是 ~/.claude/setting.json
相应的备份路径默认为 ~/.claude/setting.json.back

```bash
# 将codex配置回滚
tmf rollback --app codex --from path/to/file.bak

# 参数说明
# --app 指定某个应用
# --from 可选，支持指定备份文件路径

# 期望的输出结果
恢复成功

# 如果发生错误，例如备份丢失
错误： 应用设置备份丢失，恢复失败

```

### 4.用户想要测试供应商

测试的范围： 可访问性、延迟等等

```bash
# 测试packcode供应商
tmf test packcode --model gpt5.5 --key sk-my-api-key-string --prompt "hello"

# 参数说明
# --model 设置模型名称
# --key 设置api key
# --prompt 设置提示词，如果不指定程序默认提供一段测试提示词

# 期望结果
测试开始

# 这里输出模型返回的原始内容

---

# 正常结果示例
测试完成， 延迟200ms, token消耗0.8Kb，速率50token/秒

# 不正常结果示例
测试完成， 延迟N/A,  无法访问
测试完成， 延迟1200ms,  token消耗1.2Mb, 速率8token/秒

```
**用户没有必要每次都使用命令行设置--key，应从配置读取，除非没有设置过**

### 5. 用户想询问某个供应商详细信息

这将连接和调用api服务，返回一个非结构化的说明文档，markdown格式

```bash
# 查询供应商packcode详情
tmf ask packcode
```

###  导入与导出

导入和导出本应用所有的设置， 参见本程序的配置章节

```bash
# 导出
tmf export path/to/save.yaml

# 导入
tmf import path/from/source.yaml
```

### 用户想查看帮助

```bash
tmf help

# tmf -h 
```

## 系统配置功能

暂时没有什么可配置的，但先预设计能力

```bash
 # 获得配置
 tmf get key

# 设置
tmf set key=value
```


## 系统安全

- api服务采用开放式连接，不需要认证
- list, ask接口必须限制访问速率，每个客户端每分钟最多8次访问
- 客户端身份标识需要有可靠算法，并可以在setup时机生成，每次生成都符合幂等律
- 查询供应商列表和详情信息应使用高速缓存，降低服务器硬件成本


## 技术选型

CLI: node.js, typescript,  commander.js
API: node.js, typescript,  fastify
 