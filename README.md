# Agent Demo

A powerful, modular AI agent framework built with LangChain and LangGraph for building intelligent, tool-using assistants.

## Project Features

- **LangGraph Integration**: Stateful, multi-step agent workflows with automatic checkpointing
- **Tool Execution System**: Built-in tools for file operations, bash commands, and skill invocation
- **Skill-Based Architecture**: Extensible skill system for domain-specific capabilities
- **Subagent Support**: Run complex, multi-step tasks in isolated contexts
- **Persistence Layer**: SQLite-based checkpointing for conversation history and state recovery
- **Interactive CLI**: Command-line interface with thread management (/new, /resume, /list, /clear)

## Technical Architecture

The project follows a modular architecture with clear separation of concerns:

### Core Components
- `src/index.mjs`: Main entry point and CLI interface
- `src/agent.mjs`: LangGraph state machine definition and agent orchestration
- `src/compact.mjs`: Message compression logic for context management

### Tool System
- `src/tools/index.mjs`: Registry of available tools
- `src/tools/read.mjs`, `src/tools/write.mjs`, `src/tools/bash.mjs`: Core file and system operation tools
- `src/tools/list.mjs`, `src/tools/skill.mjs`, `src/tools/subagent.mjs`: Directory listing, skill execution, and subagent orchestration

### Skill System
- `src/skills/index.mjs`: Skill loading and registration system
- `src/skills/` directory: Location for custom skill implementations

### Persistence Layer
- `src/persistence/JsonSaver.mjs`: Local JSON-based checkpoint storage
- `.mini-agent/storage/`: Default storage location for conversation checkpoints

### Configuration & Environment
- `.env`: Environment configuration (API keys, model settings)
- `package.json`: Project dependencies and metadata
- `.gitignore`: Git configuration

## Installation Requirements

### Prerequisites
- Node.js v18.0 or higher
- npm or pnpm package manager
- OpenAI API key (or compatible LLM provider)

### Installation Steps

1. Clone the repository:
```bash
git clone https://github.com/your-username/agent-demo.git
cd agent-demo
```

2. Install dependencies:
```bash
pnpm install
# or
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env to add your API keys and configuration
```

4. Set up required environment variables in `.env`:
```
OPENAI_API_KEY=your-api-key-here
MODEL_NAME=gpt-4-turbo
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Setup Instructions

### Quick Start

1. Ensure your `.env` file is properly configured with API credentials
2. Run the agent:
```bash
node src/index.mjs
```

### Environment Configuration

The following environment variables are required:

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Your OpenAI API key | `sk-...` |
| `MODEL_NAME` | LLM model name to use | `gpt-4-turbo` |
| `OPENAI_BASE_URL` | Base URL for LLM API | `https://api.openai.com/v1` |

## Usage Examples

### Interactive CLI Commands

Once the agent is running, you can use these commands:

- `/new` - Start a new conversation thread
- `/resume <thread-id>` - Resume a previous conversation
- `/list` - List all available conversation threads
- `/clear` - Clear the current conversation thread
- `/exit` - Exit the agent

### Tool Usage Examples

**Read a file:**
```
Please read the contents of package.json
```

**Write to a file:**
```
Create a new file called hello.txt with content "Hello, World!"
```

**Execute bash command:**
```
List all files in the current directory
```

**Run a subagent task:**
```
Analyze the src/ directory structure and generate a summary
```

### Skill Invocation

The agent supports built-in skills:

- `code-runner`: Execute Node.js code files
- `code-readme-expert`: Generate professional README documentation

## Project Structure

```
agent-demo/
├── .env                    # Environment configuration
├── .gitignore              # Git ignore rules
├── .mini-agent/            # Agent runtime storage
├── README.md               # This documentation file
├── package.json            # Project metadata and dependencies
├── pnpm-lock.yaml          # Dependency lock file
├── skills/                 # Custom skill implementations
├── src/                    # Source code
│   ├── agent.mjs           # Agent state machine definition
│   ├── compact.mjs         # Message compression utilities
│   ├── index.mjs           # Main entry point and CLI
│   ├── persistence/        # State persistence layer
│   │   └── JsonSaver.mjs   # JSON-based checkpoint storage
│   ├── prompt.mjs          # System prompt configuration
│   ├── skills/             # Skill loading and management
│   ├── tools/              # Tool implementations
│   └── utils/              # Utility functions
├── test.mjs                # Test script
└── node_modules/           # Dependencies (generated)
```

## Development

### Adding New Tools

1. Create a new tool file in `src/tools/`
2. Export the tool function following the existing pattern
3. Add it to `src/tools/index.mjs` exports

### Adding New Skills

1. Create a new directory in `skills/`
2. Add a `SKILL.md` file with skill metadata and documentation
3. The skill will be automatically loaded at runtime

### Running Tests

```bash
pnpm test
```

## License

This project is licensed under the ISC License.

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.