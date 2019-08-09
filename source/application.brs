' /** @module main */

sub startApplication()
	port = createObject("roMessagePort")
	screen = createObject("roSGScreen")
	screen.setMessagePort(port)
	scene = screen.createScene("MainScene")
	screen.show()
	while true
	end while
end sub
