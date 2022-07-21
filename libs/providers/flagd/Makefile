generate:
	git submodule update --init --recursive
	(cd schemas && make gen-ts)
	mv proto ./src
