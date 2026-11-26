import ast
import builtins
import importlib

file_path = r"d:\Study\Up\SuperLanguage5.0\Backend\app\services\ai_service.py"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# 1. AST syntax
try:
    tree = ast.parse(code, filename=file_path)
    print("✓ Syntax: OK")
except SyntaxError as e:
    print(f"✗ Syntax Error: {e}")

# 2. Check undefined names using a simple AST visitor
defined_globals = set(dir(builtins))
imported_names = set()

for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            imported_names.add(alias.asname or alias.name.split('.')[0])
    elif isinstance(node, ast.ImportFrom):
        for alias in node.names:
            imported_names.add(alias.asname or alias.name)
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        imported_names.add(node.name)

print(f"✓ Found {len(imported_names)} top-level definitions and imports.")

# 3. Check for obvious errors like calling undefined functions in the file
class NameChecker(ast.NodeVisitor):
    def __init__(self):
        self.scopes = [set(imported_names) | defined_globals]
        self.errors = []

    def visit_FunctionDef(self, node):
        local_scope = set(arg.arg for arg in node.args.args)
        local_scope.update(arg.arg for arg in getattr(node.args, 'kwonlyargs', []))
        if node.args.vararg:
            local_scope.add(node.args.vararg.arg)
        if node.args.kwarg:
            local_scope.add(node.args.kwarg.arg)
        self.scopes.append(local_scope)
        self.generic_visit(node)
        self.scopes.pop()

    def visit_AsyncFunctionDef(self, node):
        self.visit_FunctionDef(node)

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                self.scopes[-1].add(target.id)
            elif isinstance(target, (ast.Tuple, ast.List)):
                for elt in target.elts:
                    if isinstance(elt, ast.Name):
                        self.scopes[-1].add(elt.id)
        self.generic_visit(node)

    def visit_For(self, node):
        if isinstance(node.target, ast.Name):
            self.scopes[-1].add(node.target.id)
        elif isinstance(node.target, (ast.Tuple, ast.List)):
            for elt in node.target.elts:
                if isinstance(elt, ast.Name):
                    self.scopes[-1].add(elt.id)
        self.generic_visit(node)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            name = node.id
            if not any(name in scope for scope in reversed(self.scopes)):
                self.errors.append((node.lineno, name))
        elif isinstance(node.ctx, ast.Store):
            self.scopes[-1].add(node.id)

checker = NameChecker()
checker.visit(tree)

if checker.errors:
    print(f"Found {len(checker.errors)} potential undefined names:")
    for lineno, name in checker.errors[:20]:
        print(f"  Line {lineno}: '{name}'")
else:
    print("✓ Scope and name resolution: No undefined variables found.")
